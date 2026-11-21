"use client";

import CardDesignStudio from "@/components/events/CardDesignStudio";

export default function EventCardDesignPage({ params }: { params: Promise<{ eventId: string }> }) {
  return <CardDesignStudio params={params} />;
}
