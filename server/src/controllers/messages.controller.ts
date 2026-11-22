import { Request, Response } from "express";
import * as svc from "../services/messages.service";

export async function listMessages(req: Request, res: Response) {
  const data = await svc.listMessages(
    req.params.eventId,
    Number(req.query.page) || 1,
    Number(req.query.pageSize) || 50
  );
  res.json({ success: true, ...data });
}

export async function sendMessages(req: Request, res: Response) {
  const { guestIds, message, channel, senderId, whatsappAccount, whatsappTemplate, whatsappMessageParameter, date, time } = req.body;
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ success: false, error: "message is required" });
    return;
  }
  if (channel !== "WHATSAPP") {
    res.status(400).json({
      success: false,
      error: "Only WhatsApp template messaging is enabled. SMS and SMS+WhatsApp are not available.",
    });
    return;
  }

  const allGuests = await svc.getEventGuests(req.params.eventId);
  const ids: string[] = guestIds?.length
    ? guestIds
    : allGuests.map((g) => g.id);

  const result = await svc.sendBulkMessages({
    eventId: req.params.eventId,
    guestIds: ids,
    message,
    channel,
    senderId,
    whatsappAccount,
    whatsappTemplate,
    whatsappMessageParameter,
    date,
    time,
    sentBy: req.user!.sub,
  });
  res.json({ success: true, data: result });
}

export async function getGuests(req: Request, res: Response) {
  const guests = await svc.getEventGuests(req.params.eventId);
  const data = guests.map(({ invitations, ...guest }) => ({
    ...guest,
    cardUrl: invitations[0]?.cardUrl ?? null,
  }));
  res.json({ success: true, data });
}

export async function getSMSBalance(_req: Request, res: Response) {
  const data = await svc.getSMSBalance();
  res.json({ success: true, data });
}
