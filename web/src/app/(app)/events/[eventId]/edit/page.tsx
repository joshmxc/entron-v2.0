"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import api from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Event name is required"),
  venue: z.string().min(1, "Venue is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof schema>;
const fetcher = (url: string) => api.get(url).then((r) => r.data);

function toLocalDateTime(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();
  const { mutate: mutateCache } = useSWRConfig();
  const { data, error, isLoading } = useSWR(`/events/${eventId}`, fetcher);
  const [submitError, setSubmitError] = useState("");
  const event = data?.data;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", venue: "", description: "", startDate: "", endDate: "", isActive: true },
  });

  useEffect(() => {
    if (!event) return;
    reset({
      name: event.name,
      venue: event.venue,
      description: event.description ?? "",
      startDate: toLocalDateTime(event.startDate),
      endDate: event.endDate ? toLocalDateTime(event.endDate) : "",
      isActive: event.isActive,
    });
  }, [event, reset]);

  const onSubmit = async (formData: FormData) => {
    setSubmitError("");
    try {
      await api.patch(`/events/${eventId}`, {
        name: formData.name,
        venue: formData.venue,
        description: formData.description || null,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
        isActive: formData.isActive,
      });
      await mutateCache(`/events/${eventId}`);
      await mutateCache("/events");
      router.push(`/events/${eventId}`);
    } catch {
      setSubmitError("Could not update the event. Please try again.");
    }
  };

  if (isLoading) return <div className="text-slate-400 text-center py-12">Loading event...</div>;
  if (error || !event) {
    return <p role="alert" className="text-red-400 text-center py-12">Could not load this event.</p>;
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/events/${eventId}`} className="text-slate-400 hover:text-slate-100" aria-label="Back to event">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="page-title">Edit Event</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
        {submitError && <p role="alert" className="text-red-400 text-sm">{submitError}</p>}
        <div className="input-group">
          <label>Event Name *</label>
          <input {...register("name")} />
          {errors.name && <p className="text-red-400 text-xs">{errors.name.message}</p>}
        </div>

        <div className="input-group">
          <label>Venue *</label>
          <input {...register("venue")} />
          {errors.venue && <p className="text-red-400 text-xs">{errors.venue.message}</p>}
        </div>

        <div className="input-group">
          <label>Description</label>
          <textarea {...register("description")} rows={3} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="input-group">
            <label>Start Date *</label>
            <input type="datetime-local" {...register("startDate")} />
            {errors.startDate && <p className="text-red-400 text-xs">{errors.startDate.message}</p>}
          </div>
          <div className="input-group">
            <label>End Date</label>
            <input type="datetime-local" {...register("endDate")} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" {...register("isActive")} className="accent-entron-blue" />
          Event is active
        </label>

        <div className="flex gap-3 pt-2">
          <Link href={`/events/${eventId}`} className="btn-secondary flex-1 text-center">Cancel</Link>
          <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
