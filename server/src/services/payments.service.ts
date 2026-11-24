import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma";
import { stkPush as mpesaPush } from "../lib/mpesa";
import { initiatePayment as airtelPay } from "../lib/airtel";
import { initiatePayment as tigoPay } from "../lib/tigopesa";

export async function initiatePayment(data: {
  eventId: string;
  guestId?: string;
  phone: string;
  amount: number;
  provider: "MPESA" | "AIRTEL" | "TIGO_PESA" | "CASH";
  description?: string;
  initiatedBy?: string;
}) {
  const event = await prisma.event.findUnique({ where: { id: data.eventId }, select: { id: true } });
  if (!event) throw { status: 404, message: "Event not found" };
  if (data.guestId) {
    const guest = await prisma.guest.findFirst({
      where: { id: data.guestId, eventId: data.eventId },
      select: { id: true },
    });
    if (!guest) throw { status: 404, message: "Guest not found in this event" };
  }
  const paymentId = uuidv4();
  const payment = await prisma.payment.create({
    data: {
      id: paymentId,
      eventId: data.eventId,
      guestId: data.guestId,
      phone: data.phone,
      amount: data.amount,
      provider: data.provider,
      description: data.description,
      initiatedBy: data.initiatedBy,
      status: data.provider === "CASH" ? "COMPLETED" : "PENDING",
    },
  });

  if (data.provider === "CASH") {
    return { payment, checkoutId: null };
  }

  try {
    let externalRef: string | null = null;

    if (data.provider === "MPESA") {
      externalRef = await mpesaPush(data.phone, data.amount, paymentId.slice(0, 12));
    } else if (data.provider === "AIRTEL") {
      externalRef = await airtelPay(data.phone, data.amount, paymentId.slice(0, 12), paymentId);
    } else if (data.provider === "TIGO_PESA") {
      const result = await tigoPay(data.phone, data.amount, paymentId.slice(0, 12));
      if (result.success && result.transactionId) {
        externalRef = result.transactionId;
        await prisma.payment.update({
          where: { id: paymentId },
          data: { status: "COMPLETED", providerRef: result.transactionId, externalRef },
        });
        return { payment: { ...payment, status: "COMPLETED" }, checkoutId: externalRef };
      }
    }

    if (externalRef) {
      await prisma.payment.update({ where: { id: paymentId }, data: { externalRef } });
    }

    return { payment: { ...payment, externalRef }, checkoutId: externalRef };
  } catch (err: unknown) {
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });
    throw err;
  }
}

export async function handleMpesaCallback(body: Record<string, unknown>) {
  const stk = (body.Body as Record<string, unknown>)?.stkCallback as Record<string, unknown>;
  if (!stk) return;

  const checkoutId = stk.CheckoutRequestID as string;
  const resultCode = Number(stk.ResultCode);
  const items = (stk.CallbackMetadata as Record<string, unknown>)?.Item as Array<{ Name: string; Value: unknown }>;

  const receiptItem = items?.find((i) => i.Name === "MpesaReceiptNumber");
  const receipt = receiptItem?.Value as string | undefined;

  const payment = await prisma.payment.findFirst({ where: { externalRef: checkoutId } });
  if (!payment) return;
  const amountItem = items?.find((i) => i.Name === "Amount");
  if (typeof amountItem?.Value === "number" && Math.abs(Number(amountItem.Value) - Number(payment.amount)) > 0.01) {
    throw { status: 400, message: "M-Pesa callback amount does not match the payment" };
  }

  const status = resultCode === 0 ? "COMPLETED" : "FAILED";
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status, providerRef: receipt ?? null, callbackPayload: body as object },
  });

}

export async function handleAirtelCallback(body: Record<string, unknown>) {
  const txn = body.transaction as Record<string, unknown>;
  if (!txn) return;

  const payment = await prisma.payment.findFirst({ where: { id: txn.id as string } });
  if (!payment) return;
  const amount = Number(txn.amount);
  if (Number.isFinite(amount) && Math.abs(amount - Number(payment.amount)) > 0.01) {
    throw { status: 400, message: "Airtel callback amount does not match the payment" };
  }

  const status = txn.status === "TS" ? "COMPLETED" : "FAILED";
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status, providerRef: txn.airtel_money_id as string, callbackPayload: body as object },
  });

}

export async function listPayments(eventId: string, page = 1, pageSize = 50) {
  const where = { eventId };
  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: { guest: { select: { firstName: true, lastName: true } } },
    }),
    prisma.payment.count({ where }),
  ]);
  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getPayment(eventId: string, id: string) {
  return prisma.payment.findFirst({ where: { id, eventId } });
}
