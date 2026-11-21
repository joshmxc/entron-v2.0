"use client";
import { use } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import api from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(1, "Guest name is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
  guestType: z.enum(["SINGLE", "DOUBLE", "FAMILY", "VIP"]).default("SINGLE"),
  maxAdmissions: z.coerce.number().int().min(1, "Enter at least one admission"),
  tableNumber: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewGuestPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();
  const [submitError, setSubmitError] = useState("");
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { guestType: "SINGLE", maxAdmissions: 1 },
  });

  const guestType = watch("guestType");

  useEffect(() => {
    if (guestType !== "FAMILY") {
      setValue("maxAdmissions", guestType === "DOUBLE" ? 2 : 1, { shouldValidate: true });
    }
  }, [guestType, setValue]);

  const onSubmit = async (data: FormData) => {
    setSubmitError("");
    const [firstName, ...lastNameParts] = data.name.trim().split(/\s+/);
    try {
      await api.post(`/events/${eventId}/guests`, {
        firstName,
        lastName: lastNameParts.join(" "),
        phone: data.phone,
        guestType: data.guestType,
        maxAdmissions: data.maxAdmissions,
        tableNumber: data.tableNumber,
        notes: data.notes,
      });
      router.push(`/events/${eventId}/guests`);
    } catch {
      setSubmitError("Could not add the guest. Please check the details and try again.");
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/events/${eventId}/guests`} className="text-slate-400 hover:text-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="page-title">Add Guest</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
        {submitError && <p role="alert" className="text-red-400 text-sm">{submitError}</p>}
        <div className="input-group">
          <label>Full Name *</label>
          <input {...register("name")} placeholder="Jane Doe" autoComplete="name" />
          {errors.name && <p className="text-red-400 text-xs">{errors.name.message}</p>}
          <p className="text-xs text-slate-500">Add one guest per submission.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="input-group">
            <label>Phone Number *</label>
            <input {...register("phone")} type="tel" placeholder="0700 000 000" />
            {errors.phone && <p className="text-red-400 text-xs">{errors.phone.message}</p>}
          </div>
          <div className="input-group">
            <label>Ticket Type</label>
            <select {...register("guestType")}>
              <option value="SINGLE">Single (1)</option>
              <option value="DOUBLE">Double (2)</option>
              <option value="FAMILY">Family (custom)</option>
              <option value="VIP">VIP</option>
            </select>
          </div>
          <div className="input-group">
            <label>Max Admissions *</label>
            <input
              {...register("maxAdmissions")}
              type="number"
              min={1}
              readOnly={guestType !== "FAMILY"}
              className={guestType !== "FAMILY" ? "opacity-70" : ""}
            />
            {errors.maxAdmissions && <p className="text-red-400 text-xs">{errors.maxAdmissions.message}</p>}
            <p className="text-xs text-slate-500">Set by ticket type except for Family.</p>
          </div>
        </div>

        <div className="input-group">
          <label>Table Number (optional)</label>
          <input {...register("tableNumber")} placeholder="A1" />
        </div>

        <div className="input-group">
          <label>Note (optional)</label>
          <textarea {...register("notes")} rows={2} placeholder="Additional notes..." />
        </div>

        <div className="flex gap-3 pt-2">
          <Link href={`/events/${eventId}/guests`} className="btn-secondary flex-1 text-center">Cancel</Link>
          <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
            {isSubmitting ? "Saving..." : "Add Guest"}
          </button>
        </div>
      </form>
    </div>
  );
}
