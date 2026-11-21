"use client";

import { ChangeEvent, DragEvent, PointerEvent, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import QRCode from "qrcode";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Check, Copy, Download, ImagePlus,
  Loader2, Maximize2, Palette, Pencil, Plus, QrCode, Printer, RefreshCw, RotateCw,
  Trash2, Type, Users, X, ZoomIn, ZoomOut,
} from "lucide-react";
import api from "@/lib/api";
import { uploadWithSignedUrl } from "@/lib/storageUpload";
import { useAuthStore } from "@/store/authStore";

type FieldType = "text" | "qr";
type GuestType = "SINGLE" | "DOUBLE" | "FAMILY" | "VIP";
type DragMode = "move" | "resize" | "rotate";
type WorkflowStep = "upload" | "design" | "guests" | "export";

const WORKFLOW_STEPS: { id: WorkflowStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "design", label: "Design" },
  { id: "guests", label: "Guests" },
  { id: "export", label: "Export" },
];

interface FieldInteraction {
  id: string;
  mode: DragMode;
  handle?: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const RESIZE_HANDLES = [
  ["nw", "-left-1 -top-1 cursor-nw-resize"],
  ["n", "left-1/2 -top-1 -translate-x-1/2 cursor-n-resize"],
  ["ne", "-right-1 -top-1 cursor-ne-resize"],
  ["e", "-right-1 top-1/2 -translate-y-1/2 cursor-e-resize"],
  ["se", "-bottom-1 -right-1 cursor-se-resize"],
  ["s", "-bottom-1 left-1/2 -translate-x-1/2 cursor-s-resize"],
  ["sw", "-bottom-1 -left-1 cursor-sw-resize"],
  ["w", "-left-1 top-1/2 -translate-y-1/2 cursor-w-resize"],
] as const;

interface DesignField {
  id: string;
  type: FieldType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label: string;
  sourceColumn: string | null;
  fallback?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  backgroundColor?: string;
  padding?: number;
  qrColor?: string;
  qrBg?: string;
  qrLevel?: "L" | "M" | "Q" | "H";
}

interface CardTemplate {
  id: string;
  name: string;
  fileUrl: string;
  fields: unknown;
  cardType: GuestType | null;
}

interface GuestInvitation {
  cardUrl?: string | null;
  status?: string;
}

interface EventGuest {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  organization?: string | null;
  custom?: Record<string, unknown> | null;
  guestType: GuestType;
  tableNumber?: string | null;
  notes?: string | null;
  qrCode: string;
  uniqueCode?: string;
  invitations?: GuestInvitation[];
}

interface EventInfo {
  id: string;
  name: string;
  venue: string;
  startDate: string;
}

const fetcher = (url: string) => api.get(url).then((response) => response.data);
async function fetchAllInvitations(url: string) {
  const firstPage = await api.get(url);
  const totalPages: number = firstPage.data.totalPages ?? 1;
  const data = [...(firstPage.data.data ?? [])];
  for (let first = 2; first <= totalPages; first += 5) {
    const pageNumbers = Array.from({ length: Math.min(5, totalPages - first + 1) }, (_value, index) => first + index);
    const responses = await Promise.all(pageNumbers.map((page) => {
      const requestUrl = new URL(url, window.location.origin);
      requestUrl.searchParams.set("page", String(page));
      requestUrl.searchParams.set("pageSize", "500");
      return api.get(`${requestUrl.pathname}${requestUrl.search}`);
    }));
    responses.forEach((response) => data.push(...(response.data.data ?? [])));
  }
  return { ...firstPage.data, data };
}
const FIELD_SOURCES = [
  ["fullName", "Full name"],
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["organization", "Organization"],
  ["guestType", "Guest type"],
  ["tableNumber", "Table number"],
  ["notes", "Guest note"],
  ["eventName", "Event name"],
  ["eventVenue", "Event venue"],
  ["eventDate", "Event date"],
  ["qrCode", "QR value"],
  ["uniqueCode", "Unique ID"],
] as const;
const FONT_OPTIONS = ["Arial", "Georgia", "Times New Roman", "Helvetica", "Inter", "Playfair Display", "Cormorant Garamond"];
const STATUS_COLORS: Record<string, string> = {
  PENDING: "badge-yellow", SENT: "badge-blue", DELIVERED: "badge-green", READ: "badge-purple", FAILED: "badge-red",
};

function makeDefaultFields(width: number, height: number): DesignField[] {
  const qrSize = Math.max(100, Math.min(250, Math.round(Math.min(width, height) * 0.2)));
  return [
    {
      id: crypto.randomUUID(), type: "text", x: width * 0.1, y: height * 0.38, w: width * 0.8, h: height * 0.13,
      rotation: 0, label: "Guest name", sourceColumn: "fullName", text: "Guest name",
      fontFamily: "Georgia", fontSize: Math.max(24, Math.round(width * 0.055)), fontWeight: 700,
      color: "#ffffff", align: "center", lineHeight: 1.2, padding: 8, backgroundColor: "transparent",
    },
    {
      id: crypto.randomUUID(), type: "qr", x: (width - qrSize) / 2, y: height * 0.68, w: qrSize, h: qrSize,
      rotation: 0, label: "Guest QR code", sourceColumn: "qrCode",
      qrColor: "#0f172a", qrBg: "#ffffff", qrLevel: "M",
    },
  ];
}

function normalizeFields(value: unknown, width: number, height: number): DesignField[] {
  if (Array.isArray(value)) return value as DesignField[];
  if (value && typeof value === "object") {
    const legacy = value as {
      guestName?: { x?: number; y?: number; size?: number; color?: string };
      qrCode?: { x?: number; y?: number; size?: number };
    };
    const fields: DesignField[] = [];
    if (legacy.guestName) {
      const size = legacy.guestName.size ?? 48;
      fields.push({
        id: crypto.randomUUID(), type: "text",
        x: (legacy.guestName.x ?? 120) - size * 4,
        y: (legacy.guestName.y ?? 160) - size * 0.7,
        w: size * 8, h: size * 1.4, rotation: 0, label: "Guest name",
        sourceColumn: "fullName", fontSize: size, fontWeight: 700,
        color: legacy.guestName.color ?? "#ffffff", align: "center",
      });
    }
    if (legacy.qrCode) {
      const size = legacy.qrCode.size ?? 200;
      fields.push({
        id: crypto.randomUUID(), type: "qr",
        x: (legacy.qrCode.x ?? 120) - size / 2,
        y: (legacy.qrCode.y ?? 300) - size / 2,
        w: size, h: size, rotation: 0, label: "Guest QR code", sourceColumn: "qrCode",
      });
    }
    return fields.length ? fields : makeDefaultFields(width, height);
  }
  return makeDefaultFields(width, height);
}

function fieldValue(key: string, guest: EventGuest | undefined, event: EventInfo | undefined): string {
  const normalizedKey = key.replace(/^guest\./, "");
  if (normalizedKey.startsWith("custom.")) {
    const value = guest?.custom?.[normalizedKey.slice("custom.".length)];
    return value == null ? "" : String(value);
  }
  switch (normalizedKey) {
    case "fullName": return guest ? `${guest.firstName} ${guest.lastName}`.trim() : "";
    case "firstName": return guest?.firstName ?? "";
    case "lastName": return guest?.lastName ?? "";
    case "phone": return guest?.phone ?? "";
    case "email": return guest?.email ?? "";
    case "organization": return guest?.organization ?? "";
    case "guestType": return guest?.guestType ?? "";
    case "tableNumber": return guest?.tableNumber ?? "";
    case "notes": return guest?.notes ?? "";
    case "qrCode": return guest?.qrCode ?? "";
    case "uniqueCode": return guest?.uniqueCode ?? "";
    case "eventName": return event?.name ?? "";
    case "eventVenue": return event?.venue ?? "";
    case "eventDate": return event?.startDate ? new Date(event.startDate).toLocaleDateString() : "";
    case "event.name": return event?.name ?? "";
    case "event.venue": return event?.venue ?? "";
    case "event.date": return event?.startDate ? new Date(event.startDate).toLocaleDateString() : "";
    default: return "";
  }
}

function guestFieldValue(field: DesignField, guest: EventGuest | undefined, event: EventInfo | undefined): string {
  const expression = field.sourceColumn
    ? `{{${field.sourceColumn}}}`
    : field.text ?? "";
  return expression.replace(/\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*([^}]*))?\s*\}\}/g, (_match, key: string, fallback?: string) =>
    fieldValue(key, guest, event) || fallback?.trim() || field.fallback || ""
  );
}

function createTextField(width: number, height: number): DesignField {
  return {
    id: crypto.randomUUID(), type: "text", x: width * 0.15, y: height * 0.5, w: width * 0.7, h: height * 0.1,
    rotation: 0, label: "Text", sourceColumn: null, text: "Add text",
    fontFamily: "Arial", fontSize: 36, fontWeight: 400, color: "#ffffff",
    align: "center", lineHeight: 1.3, padding: 8, backgroundColor: "transparent",
  };
}

function createQrField(width: number, height: number): DesignField {
  const size = Math.max(100, Math.min(220, Math.round(Math.min(width, height) * 0.18)));
  return {
    id: crypto.randomUUID(), type: "qr", x: (width - size) / 2, y: (height - size) / 2,
    w: size, h: size, rotation: 0, label: "Guest QR code", sourceColumn: "qrCode",
    qrColor: "#0f172a", qrBg: "#ffffff", qrLevel: "M",
  };
}

export default function CardDesignStudio({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user } = useAuthStore();
  const { data: eventResponse } = useSWR(`/events/${eventId}`, fetcher);
  const { data: templateResponse, mutate: mutateTemplates } = useSWR(`/events/${eventId}/invitations/templates`, fetcher);
  const { data: guestResponse, mutate: mutateGuests } = useSWR(`/events/${eventId}/invitations?pageSize=500`, fetchAllInvitations);

  const event: EventInfo | undefined = eventResponse?.data;
  const templates: CardTemplate[] = templateResponse?.data ?? [];
  const guests: EventGuest[] = guestResponse?.data ?? [];
  const customFieldKeys = useMemo(
    () => [...new Set(guests.flatMap((item) => Object.keys(item.custom ?? {})))].sort(),
    [guests]
  );
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("upload");
  const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateActionId, setTemplateActionId] = useState<string | null>(null);
  const isNewDesign = activeTemplateId === "__new__";
  const template = isNewDesign
    ? null
    : activeTemplateId
      ? templates.find((item) => item.id === activeTemplateId) ?? null
      : templates[0] ?? null;
  const [fields, setFields] = useState<DesignField[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [cardType, setCardType] = useState<GuestType | "">("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [displayWidth, setDisplayWidth] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [previewGuestId, setPreviewGuestId] = useState("");
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState("");
  const [guestPage, setGuestPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generationResult, setGenerationResult] = useState<{
    generated: number;
    failed: number;
    failedGuestIds: string[];
  } | null>(null);
  const [generationProgress, setGenerationProgress] = useState({ completed: 0, total: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<FieldInteraction | null>(null);
  const cancelGenerationRef = useRef(false);

  useEffect(() => {
    if (!template) return;
    setActiveTemplateId(template.id);
    setFields(normalizeFields(template.fields, imageDimensions.width || 1200, imageDimensions.height || 1600));
    setTemplateName(template.name);
    setCardType(template.cardType ?? "");
    setImageUrl(template.fileUrl);
    setPendingFile(null);
    setZoomLevel(1);
  // Load a template only when its selection changes; saving changes its fields in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  const resetNewDesign = () => {
    setActiveTemplateId("__new__");
    setFields([]);
    setTemplateName("");
    setCardType("");
    setImageUrl(null);
    setPendingFile(null);
    setImageLoading(false);
    setImageDimensions({ width: 0, height: 0 });
    setZoomLevel(1);
    setSelectedFieldId(null);
    setGenerationResult(null);
    setError("");
    setNotice("");
  };

  const startNewDesign = () => {
    resetNewDesign();
    setWorkflowStep("design");
  };

  useEffect(() => {
    if (guests.length && !previewGuestId) setPreviewGuestId(guests[0].id);
  }, [guests, previewGuestId]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const update = () => setDisplayWidth(image.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(image);
    return () => observer.disconnect();
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const guest = guests.find((item) => item.id === previewGuestId) ?? guests[0];
  const selectedField = fields.find((item) => item.id === selectedFieldId) ?? null;
  const selectedGuests = useMemo(
    () => selectedGuestIds === null ? guests : guests.filter((item) => selectedGuestIds.has(item.id)),
    [guests, selectedGuestIds]
  );
  const cardsReady = useMemo(() => guests.filter((item) => item.invitations?.[0]?.cardUrl), [guests]);
  const filteredGuests = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return guests;
    return guests.filter((item) =>
      `${item.firstName} ${item.lastName} ${item.phone ?? ""}`.toLowerCase().includes(query)
    );
  }, [guests, search]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(filteredGuests.length / pageSize));
  const visibleGuests = filteredGuests.slice((guestPage - 1) * pageSize, guestPage * pageSize);
  const previewOptions = guest && !visibleGuests.some((item) => item.id === guest.id)
    ? [guest, ...visibleGuests]
    : visibleGuests;
  const preflightWarnings = useMemo(() => {
    const warnings: string[] = [];
    const missingNames = selectedGuests.filter((item) => !`${item.firstName} ${item.lastName}`.trim()).length;
    if (missingNames) warnings.push(`${missingNames} selected guest(s) have no full name.`);
    const boundTextFields = fields.filter((field) => field.type === "text" && field.sourceColumn);
    for (const field of boundTextFields) {
      const missing = selectedGuests.filter((item) => !guestFieldValue(field, item, event)).length;
      if (missing) warnings.push(`${missing} guest(s) will have an empty value for "${field.label}".`);
    }
    return warnings;
  }, [event, fields, selectedGuests]);

  const qrFields = useMemo(() => fields.filter((item) => item.type === "qr"), [fields]);
  const [qrPreviews, setQrPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    if (!guest) {
      setQrPreviews({});
      return () => { active = false; };
    }
    Promise.all(qrFields.map(async (field) => {
      const url = await QRCode.toDataURL(guest.qrCode, {
        width: Math.max(128, Math.min(512, Math.round(Math.max(field.w, field.h)))),
        margin: 1,
        errorCorrectionLevel: field.qrLevel ?? "M",
        color: { dark: field.qrColor ?? "#0f172a", light: field.qrBg ?? "#ffffff" },
      });
      return [field.id, url] as const;
    })).then((entries) => {
      if (active) setQrPreviews(Object.fromEntries(entries));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not render the guest QR code.");
    });
    return () => { active = false; };
  }, [guest, qrFields]);

  useEffect(() => {
    setGuestPage(1);
  }, [search, guests.length]);

  const loadBackgroundFile = (file: File, onLoaded?: () => void) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP card image.");
      return false;
    }
    setError("");
    setImageLoading(true);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setPendingFile(file);
      setImageUrl(url);
      setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setTemplateName((current) => current || file.name.replace(/\.[^.]+$/, ""));
      setFields(makeDefaultFields(image.naturalWidth, image.naturalHeight));
      setSelectedFieldId(null);
      setImageLoading(false);
      onLoaded?.();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setImageLoading(false);
      setError("The selected file could not be opened as an image.");
    };
    image.src = url;
    return true;
  };

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) loadBackgroundFile(file);
  };

  const onUploadStepFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      if (file) setError("Choose a JPG, PNG, or WebP card image.");
      return;
    }
    resetNewDesign();
    loadBackgroundFile(file, () => setWorkflowStep("design"));
  };

  const onUploadStepDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      if (file) setError("Choose a JPG, PNG, or WebP card image.");
      return;
    }
    resetNewDesign();
    loadBackgroundFile(file, () => setWorkflowStep("design"));
  };

  const saveDesign = async () => {
    if (!imageUrl) {
      setError("Upload a card image before saving your design.");
      return false;
    }
    if (!fields.some((item) => item.type === "qr")) {
      setError("Add at least one QR code field so each guest receives their unique scan code.");
      return false;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (pendingFile) {
        const endpoint = `/events/${eventId}/invitations/templates`;
        const storagePath = await uploadWithSignedUrl(`${endpoint}/upload-url`, pendingFile);
        const payload = {
          name: templateName.trim() || pendingFile.name,
          fields,
          cardType: cardType || null,
          ...(template ? { templateId: template.id } : {}),
        };
        let response;
        if (storagePath) {
          response = await api.post(endpoint, {
            ...payload,
            filename: pendingFile.name,
            storagePath,
          });
        } else {
          const form = new FormData();
          form.append("file", pendingFile);
          form.append("name", payload.name);
          form.append("fields", JSON.stringify(fields));
          if (cardType) form.append("cardType", cardType);
          if (template) form.append("templateId", template.id);
          response = await api.post(endpoint, form);
        }
        setActiveTemplateId(response.data.data.id);
        setPendingFile(null);
        setImageUrl(response.data.data.fileUrl);
        setFields(normalizeFields(response.data.data.fields, imageDimensions.width, imageDimensions.height));
      } else if (template) {
        const response = await api.patch(`/events/${eventId}/invitations/templates/${template.id}`, {
          name: templateName.trim() || template.name,
          fields,
          cardType: cardType || null,
        });
        setFields(normalizeFields(response.data.data.fields, imageDimensions.width, imageDimensions.height));
      }
      await mutateTemplates();
      setNotice("Card design saved. You can now generate personalized cards for this event's guests.");
      return true;
    } catch (reason) {
      setError(apiError(reason, "Could not save the card design."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndContinueToGuests = async () => {
    if (await saveDesign()) setWorkflowStep("guests");
  };

  const beginRenameTemplate = (item: CardTemplate) => {
    setError("");
    setNotice("");
    setRenamingTemplateId(item.id);
    setTemplateNameDraft(item.name);
  };

  const renameTemplate = async (item: CardTemplate) => {
    const name = templateNameDraft.trim();
    if (!name) {
      setError("Enter a name for this design.");
      return;
    }
    if (name === item.name) {
      setRenamingTemplateId(null);
      return;
    }

    setTemplateActionId(item.id);
    setError("");
    setNotice("");
    try {
      await api.patch(`/events/${eventId}/invitations/templates/${item.id}`, { name });
      if (template?.id === item.id) setTemplateName(name);
      await mutateTemplates();
      setRenamingTemplateId(null);
      setNotice(`Design renamed to "${name}".`);
    } catch (reason) {
      setError(apiError(reason, "Could not rename this design."));
    } finally {
      setTemplateActionId(null);
    }
  };

  const deleteTemplate = async (item: CardTemplate) => {
    if (!window.confirm(`Delete "${item.name}"? Previously generated guest cards will be kept.`)) return;

    setTemplateActionId(item.id);
    setError("");
    setNotice("");
    try {
      await api.delete(`/events/${eventId}/invitations/templates/${item.id}`);
      if (template?.id === item.id) {
        resetNewDesign();
        setWorkflowStep("upload");
      }
      if (renamingTemplateId === item.id) setRenamingTemplateId(null);
      await mutateTemplates();
      setNotice(`Design "${item.name}" deleted. Previously generated guest cards were kept.`);
    } catch (reason) {
      setError(apiError(reason, "Could not delete this design."));
    } finally {
      setTemplateActionId(null);
    }
  };

  const addField = (type: FieldType) => {
    if (!imageDimensions.width || !imageDimensions.height) return;
    const field = type === "text"
      ? createTextField(imageDimensions.width, imageDimensions.height)
      : createQrField(imageDimensions.width, imageDimensions.height);
    setFields((current) => [...current, field]);
    setSelectedFieldId(field.id);
  };

  const updateField = (id: string, patch: Partial<DesignField>) => {
    setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field));
  };

  const startDrag = (
    event: PointerEvent<HTMLDivElement>,
    field: DesignField,
    mode: DragMode = "move",
    handle?: string
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedFieldId(field.id);
    dragRef.current = {
      id: field.id,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      x: field.x,
      y: field.y,
      w: field.w,
      h: field.h,
    };
    stageRef.current?.setPointerCapture(event.pointerId);
  };

  const moveField = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const image = imageRef.current;
    if (!drag || !image) return;
    const bounds = image.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dx = (event.clientX - drag.startX) * imageDimensions.width / bounds.width;
    const dy = (event.clientY - drag.startY) * imageDimensions.height / bounds.height;
    if (drag.mode === "move") {
      updateField(drag.id, { x: Math.round(drag.x + dx), y: Math.round(drag.y + dy) });
      return;
    }
    if (drag.mode === "resize") {
      const handle = drag.handle ?? "";
      let x = drag.x;
      let y = drag.y;
      let w = drag.w;
      let h = drag.h;
      if (handle.includes("e")) w = Math.max(24, drag.w + dx);
      if (handle.includes("s")) h = Math.max(24, drag.h + dy);
      if (handle.includes("w")) {
        w = Math.max(24, drag.w - dx);
        x = drag.x + drag.w - w;
      }
      if (handle.includes("n")) {
        h = Math.max(24, drag.h - dy);
        y = drag.y + drag.h - h;
      }
      updateField(drag.id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      return;
    }

    const centerX = bounds.left + (drag.x + drag.w / 2) * bounds.width / imageDimensions.width;
    const centerY = bounds.top + (drag.y + drag.h / 2) * bounds.height / imageDimensions.height;
    let rotation = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90;
    if (rotation > 180) rotation -= 360;
    if (rotation < -180) rotation += 360;
    if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
    updateField(drag.id, { rotation });
  };

  const duplicateField = (field: DesignField) => {
    const duplicate = { ...field, id: crypto.randomUUID(), x: field.x + 24, y: field.y + 24 };
    setFields((current) => [...current, duplicate]);
    setSelectedFieldId(duplicate.id);
  };

  const generateCards = async (guestIds = selectedGuests.map((item) => item.id)) => {
    if (!template) {
      setError("Save a card design before generating guest cards.");
      return;
    }
    if (!guestIds.length) {
      setError("Select at least one guest to generate cards.");
      return;
    }
    setGenerating(true);
    cancelGenerationRef.current = false;
    setError("");
    setNotice("");
    setGenerationResult(null);
    setGenerationProgress({ completed: 0, total: guestIds.length });
    try {
      let generated = 0;
      let failed = 0;
      const failedGuestIds: string[] = [];
      let completed = 0;
      for (let index = 0; index < guestIds.length; index += 50) {
        if (cancelGenerationRef.current) break;
        const batch = guestIds.slice(index, index + 50);
        const response = await api.post(`/events/${eventId}/invitations/generate`, {
          templateId: template.id,
          guestIds: batch,
        });
        generated += response.data.data.generated;
        failed += response.data.data.failed;
        failedGuestIds.push(...response.data.data.failedGuestIds);
        completed += batch.length;
        setGenerationProgress({ completed, total: guestIds.length });
      }
      setGenerationResult({ generated, failed, failedGuestIds });
      await mutateGuests();
      setNotice(
        `${cancelGenerationRef.current ? "Generation stopped" : "Generation complete"}: ` +
        `${generated} guest card(s) generated; ${failed} failed.`
      );
    } catch (reason) {
      setError(apiError(reason, "Could not generate guest cards."));
    } finally {
      setGenerating(false);
      cancelGenerationRef.current = false;
    }
  };

  const cancelGeneration = () => {
    cancelGenerationRef.current = true;
  };

  const toggleGuest = (id: string) => {
    const next = new Set(selectedGuestIds ?? guests.map((item) => item.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedGuestIds(next);
  };

  const toggleAllGuests = () => {
    setSelectedGuestIds(selectedGuests.length === guests.length ? new Set() : null);
  };

  const updateImageSize = (image: HTMLImageElement) => {
    setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    setDisplayWidth(image.clientWidth);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link href={`/events/${eventId}`} className="text-slate-400 hover:text-slate-100" aria-label="Back to event">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="page-title flex items-center gap-2"><Palette className="h-5 w-5 text-purple-400" />Card Design</h1>
          <p className="truncate text-sm text-slate-400">{event?.name ?? "Loading event..."}</p>
        </div>
      </header>

      <nav aria-label="Card design workflow" className="card flex items-center justify-between gap-2 overflow-x-auto px-4 py-3 sm:px-6">
        {WORKFLOW_STEPS.map((step, index) => {
          const currentIndex = WORKFLOW_STEPS.findIndex((item) => item.id === workflowStep);
          const complete = index < currentIndex;
          const current = index === currentIndex;
          return (
            <div key={step.id} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
                    current
                      ? "border-entron-blue bg-entron-blue text-white"
                      : complete
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-entron-dark-border text-slate-400"
                  }`}
                  aria-current={current ? "step" : undefined}
                >
                  {complete ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className={`text-xs font-medium sm:text-sm ${current ? "text-slate-100" : "text-slate-400"}`}>
                  {step.label}
                </span>
              </div>
              {index < WORKFLOW_STEPS.length - 1 && (
                <span className={`h-px min-w-3 flex-1 ${complete ? "bg-green-600" : "bg-entron-dark-border"}`} />
              )}
            </div>
          );
        })}
      </nav>

      {error && <div role="alert" className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-green-800 bg-green-950/40 px-4 py-3 text-sm text-green-300">{notice}</div>}

      {workflowStep === "upload" && (
        <section className="mx-auto max-w-6xl space-y-8 py-4">
          <div className="text-center">
            <p className="mb-3 inline-flex rounded-full border border-entron-blue/20 bg-entron-blue/10 px-3 py-1 text-xs font-medium text-blue-300">
              Step 1 — Upload your invitation
            </p>
            <h2 className="text-3xl font-semibold text-slate-100 sm:text-4xl">Start with your card design</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
              Upload a card background for this event or choose one of its saved designs to personalize for each guest.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <div
              className="card flex min-h-72 flex-col items-center justify-center border-2 border-dashed text-center transition hover:border-entron-blue/60 lg:col-span-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={onUploadStepDrop}
            >
              <ImagePlus className="mb-4 h-12 w-12 text-entron-blue" />
              <h3 className="font-semibold text-slate-100">
                {imageLoading ? "Reading your card..." : "Drop your card here, or browse"}
              </h3>
              <p className="mt-2 text-sm text-slate-400">JPG, PNG, or WebP · up to 20 MB</p>
              <label className="btn-primary mt-5 cursor-pointer text-sm">
                {imageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                Choose card image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={imageLoading}
                  onChange={onUploadStepFileSelected}
                />
              </label>
            </div>

            <div className="card flex flex-col justify-center gap-4 lg:col-span-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Create a new design</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Open the editor to upload a background, add guest names and unique QR codes, and customize the layout.
                </p>
              </div>
              <button type="button" onClick={startNewDesign} className="btn-secondary justify-center">
                <Palette className="h-4 w-4" /> Start a new design
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-100">Saved designs for this event</h3>
                <p className="mt-1 text-sm text-slate-400">Choose a saved design to edit or use for card generation.</p>
              </div>
              <span className="text-sm text-slate-400">{templates.length} design{templates.length === 1 ? "" : "s"}</span>
            </div>
            {templates.length === 0 ? (
              <div className="card py-8 text-center text-sm text-slate-400">
                No saved designs yet. Upload a card image or start a new design to get started.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {templates.map((item) => (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-entron-dark-border bg-entron-dark-card"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setActiveTemplateId(item.id);
                        setWorkflowStep("design");
                      }}
                      className="group block w-full text-left transition hover:bg-slate-800/50"
                    >
                      <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-slate-950">
                        <img src={item.fileUrl} alt={item.name} className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="p-3">
                        <p className="truncate text-sm font-medium text-slate-100">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {Array.isArray(item.fields) ? item.fields.length : 0} layers
                          {item.cardType ? ` · ${item.cardType}` : " · All guest types"}
                        </p>
                      </div>
                    </button>
                    {renamingTemplateId === item.id ? (
                      <div className="flex items-center gap-2 border-t border-entron-dark-border p-3">
                        <input
                          autoFocus
                          aria-label={`New name for ${item.name}`}
                          value={templateNameDraft}
                          onChange={(event) => setTemplateNameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void renameTemplate(item);
                            } else if (event.key === "Escape") {
                              setRenamingTemplateId(null);
                            }
                          }}
                          className="min-w-0 text-sm"
                        />
                        <button
                          type="button"
                          aria-label={`Save name for ${item.name}`}
                          title="Save name"
                          disabled={templateActionId !== null}
                          onClick={() => void renameTemplate(item)}
                          className="rounded-lg p-2 text-green-400 hover:bg-slate-800 disabled:opacity-40"
                        >
                          {templateActionId === item.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Check className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          aria-label={`Cancel renaming ${item.name}`}
                          title="Cancel"
                          disabled={templateActionId !== null}
                          onClick={() => setRenamingTemplateId(null)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-40"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : user?.role === "ADMIN" ? (
                      <div className="flex items-center justify-between border-t border-entron-dark-border px-3 py-2">
                        <button
                          type="button"
                          disabled={templateActionId !== null}
                          onClick={() => beginRenameTemplate(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Rename
                        </button>
                        <button
                          type="button"
                          disabled={templateActionId !== null}
                          onClick={() => void deleteTemplate(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-red-300 hover:bg-red-950/60 disabled:opacity-40"
                        >
                          {templateActionId === item.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {workflowStep === "design" && <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-100">Design this event&apos;s guest cards</h2>
            <p className="mt-1 text-sm text-slate-400">
              Add text and QR layers, then drag them into place. Guest fields and scan codes are filled in individually for each guest.
            </p>
          </div>
          {templates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-400">
                Design for {event?.name ?? "this event"}
                <select
                  value={isNewDesign ? "__new__" : template?.id ?? ""}
                  onChange={(change) => {
                    if (change.target.value === "__new__") startNewDesign();
                    else setActiveTemplateId(change.target.value);
                  }}
                  aria-label="Select card design"
                >
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.cardType ? ` · ${item.cardType}` : " · All guest types"}
                    </option>
                  ))}
                  <option value="__new__">Create a new design...</option>
                </select>
              </label>
              <button type="button" onClick={startNewDesign} className="btn-secondary text-sm">
                New design
              </button>
            </div>
          )}
          <button onClick={saveDesign} disabled={saving || !imageUrl} className="btn-primary text-sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? "Saving..." : "Save design"}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {!imageUrl ? (
              <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-entron-dark-border text-center hover:border-entron-blue/50">
                <ImagePlus className="mb-3 h-10 w-10 text-slate-500" />
                <span className="font-medium text-slate-200">Upload a card background</span>
                <span className="mt-1 text-sm text-slate-500">JPG, PNG, or WebP (up to 20 MB)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileSelected} />
              </label>
            ) : (
              <>
                <div
                  ref={stageRef}
                  className="relative mx-auto h-[65vh] min-h-[420px] w-full max-w-3xl select-none overflow-auto rounded-lg border border-entron-dark-border bg-slate-950 touch-none"
                  onPointerMove={moveField}
                  onPointerUp={(event) => {
                    dragRef.current = null;
                    if (stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { dragRef.current = null; }}
                  onClick={() => setSelectedFieldId(null)}
                >
                  <div className="pointer-events-none absolute left-3 top-3 z-10 hidden items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-400 sm:flex">
                    <span>Drag to move</span><span className="text-slate-600">·</span><span>Use handles to resize or rotate</span>
                  </div>
                  <div
                    className="flex min-h-full min-w-full p-8"
                    style={{ justifyContent: zoomLevel > 1 ? "flex-start" : "center" }}
                  >
                    <div
                      className="relative shrink-0"
                      style={{
                        width: `${zoomLevel * 100}%`,
                        maxWidth: zoomLevel > 1 ? "none" : "48rem",
                      }}
                    >
                      <img
                        ref={imageRef}
                        src={imageUrl}
                        alt="Card background"
                        className="block h-auto w-full"
                        onLoad={(event) => updateImageSize(event.currentTarget)}
                        draggable={false}
                      />
                      {imageDimensions.width > 0 && fields.map((field) => {
                        const selected = field.id === selectedFieldId;
                        const ratio = displayWidth / imageDimensions.width;
                        return (
                          <div
                            key={field.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Select ${field.label}`}
                            className="absolute cursor-move select-none"
                            style={{
                              left: `${field.x / imageDimensions.width * 100}%`,
                              top: `${field.y / imageDimensions.height * 100}%`,
                              width: `${field.w / imageDimensions.width * 100}%`,
                              height: `${field.h / imageDimensions.height * 100}%`,
                              transform: `rotate(${field.rotation}deg)`,
                              color: field.type === "text" ? field.color ?? "#ffffff" : undefined,
                              backgroundColor: field.type === "text" && field.backgroundColor !== "transparent" ? field.backgroundColor : undefined,
                              fontFamily: field.fontFamily ?? "Arial",
                              fontSize: `${Math.max(7, (field.fontSize ?? 36) * ratio)}px`,
                              fontWeight: field.fontWeight ?? 400,
                              textAlign: field.align ?? "center",
                              lineHeight: field.lineHeight ?? 1.2,
                              padding: `${(field.padding ?? 4) * ratio}px`,
                              boxSizing: "border-box",
                            }}
                            onPointerDown={(event) => startDrag(event, field)}
                            onClick={(event) => { event.stopPropagation(); setSelectedFieldId(field.id); }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") setSelectedFieldId(field.id);
                            }}
                          >
                            <div className={`flex h-full w-full items-center justify-center overflow-hidden border-2 ${
                              selected ? "border-entron-blue bg-entron-blue/10" : "border-white/60 bg-black/10 hover:border-entron-blue/70"
                            }`}>
                              {field.type === "qr"
                                ? <img src={qrPreviews[field.id]} alt={`Unique QR for ${guest ? `${guest.firstName} ${guest.lastName}` : "guest"}`} className="h-full w-full object-contain" draggable={false} />
                                : <span className="w-full overflow-hidden break-words">{guestFieldValue(field, guest, event)}</span>}
                            </div>
                            {selected && RESIZE_HANDLES.map(([handle, position]) => (
                              <div
                                key={handle}
                                aria-hidden="true"
                                className={`absolute z-20 h-3 w-3 rounded-sm border-2 border-entron-blue bg-white shadow ${position}`}
                                onPointerDown={(pointerEvent) => startDrag(pointerEvent, field, "resize", handle)}
                              />
                            ))}
                            {selected && (
                              <>
                                <div
                                  aria-hidden="true"
                                  className="absolute -top-8 left-1/2 z-20 flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-2 border-entron-blue bg-white text-entron-blue shadow active:cursor-grabbing"
                                  onPointerDown={(pointerEvent) => startDrag(pointerEvent, field, "rotate")}
                                >
                                  <RotateCw className="h-3 w-3" />
                                </div>
                                <div className="pointer-events-none absolute -top-2 left-1/2 z-10 h-2 w-px bg-entron-blue" />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/95 px-2 py-1 shadow-xl">
                    <button
                      type="button"
                      title="Zoom out"
                      aria-label="Zoom out"
                      onClick={() => setZoomLevel((current) => Math.max(0.5, Math.round((current - 0.1) * 100) / 100))}
                      disabled={zoomLevel <= 0.5}
                      className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.05"
                      value={zoomLevel}
                      aria-label="Canvas zoom"
                      onChange={(event) => setZoomLevel(Number(event.target.value))}
                      className="w-24"
                    />
                    <span className="min-w-10 text-center text-xs tabular-nums text-slate-300">{Math.round(zoomLevel * 100)}%</span>
                    <button
                      type="button"
                      title="Zoom in"
                      aria-label="Zoom in"
                      onClick={() => setZoomLevel((current) => Math.min(2, Math.round((current + 0.1) * 100) / 100))}
                      disabled={zoomLevel >= 2}
                      className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Fit canvas"
                      aria-label="Fit canvas"
                      onClick={() => setZoomLevel(1)}
                      className="ml-1 flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      <Maximize2 className="h-4 w-4" /> Fit
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-400">
                    Preview guest
                    <select value={guest?.id ?? ""} onChange={(event) => setPreviewGuestId(event.target.value)} disabled={!guests.length}>
                      {previewOptions.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName} · {item.guestType}</option>)}
                    </select>
                  </label>
                  <label className="btn-secondary cursor-pointer text-sm">
                    <ImagePlus className="h-4 w-4" /> Replace background
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileSelected} />
                  </label>
                </div>
              </>
            )}
          </div>

          <aside className="card max-h-[75vh] space-y-4 overflow-y-auto">
            <div className="flex gap-2">
              <button onClick={() => addField("text")} disabled={!imageUrl} className="btn-secondary flex-1 justify-center text-sm">
                <Plus className="h-4 w-4" /><Type className="h-4 w-4" /> Text
              </button>
              <button onClick={() => addField("qr")} disabled={!imageUrl} className="btn-secondary flex-1 justify-center text-sm">
                <Plus className="h-4 w-4" /><QrCode className="h-4 w-4" /> QR
              </button>
            </div>

            {fields.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Layers</p>
                {fields.map((field) => (
                  <div key={field.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${selectedFieldId === field.id ? "bg-entron-blue/15" : "hover:bg-slate-800"}`}>
                    <button onClick={() => setSelectedFieldId(field.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-slate-200">
                      {field.type === "text" ? <Type className="h-4 w-4 shrink-0 text-entron-blue" /> : <QrCode className="h-4 w-4 shrink-0 text-purple-400" />}
                      <span className="truncate">{field.label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateField(field)}
                      aria-label={`Duplicate ${field.label}`}
                      title="Duplicate layer"
                      className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setFields((current) => current.filter((item) => item.id !== field.id)); if (selectedFieldId === field.id) setSelectedFieldId(null); }}
                      aria-label={`Delete ${field.label}`} className="rounded p-1 text-slate-500 hover:bg-red-950 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedField && (
              <div className="space-y-3 border-t border-entron-dark-border pt-3">
                <label className="input-group">
                  <span>Layer name</span>
                  <input value={selectedField.label} onChange={(event) => updateField(selectedField.id, { label: event.target.value })} />
                </label>
                {selectedField.type === "text" ? (
                  <>
                    <label className="input-group">
                      <span>Guest / event data</span>
                      <select value={selectedField.sourceColumn ?? ""} onChange={(event) => updateField(selectedField.id, { sourceColumn: event.target.value || null })}>
                        <option value="">Custom text</option>
                        {FIELD_SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        {customFieldKeys.map((key) => (
                          <option key={`custom.${key}`} value={`custom.${key}`}>Custom: {key}</option>
                        ))}
                      </select>
                    </label>
                    {selectedField.sourceColumn ? (
                      <label className="input-group">
                        <span>Fallback when empty</span>
                        <input
                          value={selectedField.fallback ?? ""}
                          onChange={(event) => updateField(selectedField.id, { fallback: event.target.value })}
                          placeholder="Optional fallback"
                        />
                      </label>
                    ) : (
                      <label className="input-group">
                        <span>Text and data bindings</span>
                        <textarea
                          rows={3}
                          value={selectedField.text ?? ""}
                          onChange={(event) => updateField(selectedField.id, { text: event.target.value })}
                          placeholder="Example: {{guest.firstName}} · {{event.name}}"
                        />
                        <span className="text-xs text-slate-500">
                          Bind values with {"{{guest.fullName}}"}, {"{{event.name}}"}, or {"{{guest.custom.field}}"}.
                          Add a fallback with {"{{guest.email | No email}}"}.
                        </span>
                      </label>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="input-group">
                        <span>Font</span>
                        <select value={selectedField.fontFamily ?? "Arial"} onChange={(event) => updateField(selectedField.id, { fontFamily: event.target.value })}>
                          {FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
                        </select>
                      </label>
                      <label className="input-group">
                        <span>Font size</span>
                        <input type="number" min="8" max="400" value={selectedField.fontSize ?? 36}
                          onChange={(event) => updateField(selectedField.id, { fontSize: boundedNumber(event.target.value, 36, 8, 400) })} />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="input-group">
                        <span>Weight</span>
                        <select value={selectedField.fontWeight ?? 400} onChange={(event) => updateField(selectedField.id, { fontWeight: Number(event.target.value) })}>
                          {[300, 400, 500, 600, 700].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                        </select>
                      </label>
                      <label className="input-group">
                        <span>Style</span>
                        <select value={selectedField.fontStyle ?? "normal"} onChange={(event) => updateField(selectedField.id, { fontStyle: event.target.value as "normal" | "italic" })}>
                          <option value="normal">Normal</option><option value="italic">Italic</option>
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="input-group">
                        <span>Text color</span>
                        <input type="color" value={selectedField.color ?? "#ffffff"} onChange={(event) => updateField(selectedField.id, { color: event.target.value })} />
                      </label>
                      <div>
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Alignment</span>
                        <div className="flex gap-1">
                          {([
                            ["left", AlignLeft],
                            ["center", AlignCenter],
                            ["right", AlignRight],
                          ] as const).map(([align, Icon]) => (
                            <button
                              key={align}
                              type="button"
                              aria-label={`Align ${align}`}
                              onClick={() => updateField(selectedField.id, { align })}
                              className={`flex-1 rounded-lg border p-2 ${
                                (selectedField.align ?? "center") === align
                                  ? "border-entron-blue bg-entron-blue/20 text-entron-blue"
                                  : "border-entron-dark-border text-slate-400 hover:bg-slate-800"
                              }`}
                            >
                              <Icon className="mx-auto h-4 w-4" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="input-group">
                        <span>Line height</span>
                        <input
                          type="number"
                          min="1"
                          max="3"
                          step="0.05"
                          value={selectedField.lineHeight ?? 1.3}
                          onChange={(event) => updateField(selectedField.id, { lineHeight: boundedNumber(event.target.value, 1.3, 1, 3) })}
                        />
                      </label>
                      <label className="input-group">
                        <span>Letter spacing</span>
                        <input
                          type="number"
                          min="-10"
                          max="30"
                          step="0.5"
                          value={selectedField.letterSpacing ?? 0}
                          onChange={(event) => updateField(selectedField.id, { letterSpacing: boundedNumber(event.target.value, 0, -10, 30) })}
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                      <input type="checkbox" checked={selectedField.backgroundColor !== "transparent"}
                        onChange={(event) => updateField(selectedField.id, { backgroundColor: event.target.checked ? "#000000" : "transparent" })} />
                      Background
                      {selectedField.backgroundColor !== "transparent" && (
                        <input type="color" value={selectedField.backgroundColor ?? "#000000"}
                          onChange={(event) => updateField(selectedField.id, { backgroundColor: event.target.value })} />
                      )}
                    </label>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-400">This field uses each guest&apos;s own unique QR scan code.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="input-group">
                        <span>QR color</span>
                        <input type="color" value={selectedField.qrColor ?? "#0f172a"} onChange={(event) => updateField(selectedField.id, { qrColor: event.target.value })} />
                      </label>
                      <label className="input-group">
                        <span>QR background</span>
                        <input type="color" value={selectedField.qrBg ?? "#ffffff"} onChange={(event) => updateField(selectedField.id, { qrBg: event.target.value })} />
                      </label>
                    </div>
                    <label className="input-group">
                      <span>Error correction</span>
                      <select value={selectedField.qrLevel ?? "M"} onChange={(event) => updateField(selectedField.id, { qrLevel: event.target.value as DesignField["qrLevel"] })}>
                        <option value="L">Low</option><option value="M">Medium</option><option value="Q">Quartile</option><option value="H">High</option>
                      </select>
                    </label>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 border-t border-entron-dark-border pt-3">
                  {(["x", "y", "w", "h"] as const).map((key) => (
                    <label key={key} className="input-group">
                      <span>{key.toUpperCase()}</span>
                      <input type="number" value={Math.round(selectedField[key])}
                        onChange={(event) => updateField(selectedField.id, { [key]: boundedNumber(event.target.value, selectedField[key], 0, 10000) })} />
                    </label>
                  ))}
                </div>
                <label className="input-group">
                  <span>Rotation: {selectedField.rotation}°</span>
                  <input type="range" min="-180" max="180" value={selectedField.rotation}
                    onChange={(event) => updateField(selectedField.id, { rotation: Number(event.target.value) })} />
                </label>
              </div>
            )}

            <div className="space-y-3 border-t border-entron-dark-border pt-3">
              <label className="input-group">
                <span>Design name</span>
                <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Event card design" />
              </label>
              <label className="input-group">
                <span>Use for guest type</span>
                <select value={cardType} onChange={(event) => setCardType(event.target.value as GuestType | "")}>
                  <option value="">All guest types / fallback</option>
                  <option value="SINGLE">Single</option><option value="DOUBLE">Double</option>
                  <option value="FAMILY">Family</option><option value="VIP">VIP</option>
                </select>
              </label>
            </div>
          </aside>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-entron-dark-border pt-4">
          <button type="button" onClick={() => setWorkflowStep("upload")} className="btn-secondary text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to designs
          </button>
          <button
            type="button"
            onClick={saveAndContinueToGuests}
            disabled={saving || !imageUrl}
            className="btn-primary text-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save and continue to guests
          </button>
        </div>
      </section>}

      {workflowStep === "guests" && <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-medium text-entron-blue">Step 3 — Select your guests</p>
            <h2 className="flex items-center gap-2 font-semibold text-slate-100">
              <Users className="h-4 w-4 text-entron-blue" />Guest list ({guests.length})
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Choose the event guests to receive cards. Names and unique QR codes come from their existing guest records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/events/${eventId}/guests`} className="btn-secondary text-sm">Manage guests</Link>
            <Link href={`/events/${eventId}/guests/import`} className="btn-secondary text-sm">Import guest list</Link>
          </div>
        </div>

        {preflightWarnings.length > 0 && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2" role="status">
            <p className="text-sm font-medium text-amber-300">Preflight warnings</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-amber-200">
              {preflightWarnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        )}

        {guests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-entron-dark-border py-8 text-center text-sm text-slate-400">
            Import or add guests to this event, then return here to select who should receive a card.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={selectedGuests.length === guests.length}
                  onChange={toggleAllGuests} />
                Select all ({selectedGuests.length}/{guests.length})
              </label>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guests..." className="max-w-xs text-sm" />
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-entron-dark-border divide-y divide-entron-dark-border">
              {visibleGuests.map((item) => {
                const invitation = item.invitations?.[0];
                const checked = selectedGuestIds === null || selectedGuestIds.has(item.id);
                return (
                  <label key={item.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-800/60">
                    <input type="checkbox" checked={checked} onChange={() => toggleGuest(item.id)} />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{item.firstName} {item.lastName}</span>
                    <span className="badge badge-blue text-xs">{item.guestType}</span>
                    <span className={`badge text-xs ${STATUS_COLORS[invitation?.status ?? ""] ?? "badge-yellow"}`}>
                      {invitation?.cardUrl ? invitation.status ?? "Ready" : "Not generated"}
                    </span>
                  </label>
                );
              })}
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between text-sm text-slate-400">
                <button
                  type="button"
                  onClick={() => setGuestPage((page) => Math.max(1, page - 1))}
                  disabled={guestPage === 1}
                  className="btn-secondary text-xs"
                >
                  Previous
                </button>
                <span>Page {guestPage} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setGuestPage((page) => Math.min(pageCount, page + 1))}
                  disabled={guestPage === pageCount}
                  className="btn-secondary text-xs"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-entron-dark-border pt-4">
          <button type="button" onClick={() => setWorkflowStep("design")} className="btn-secondary text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to design
          </button>
          <button
            type="button"
            onClick={() => setWorkflowStep("export")}
            disabled={!template || !selectedGuests.length}
            className="btn-primary text-sm"
          >
            Continue to export ({selectedGuests.length})
          </button>
        </div>
      </section>}

      {workflowStep === "export" && (
        <section className="space-y-5">
          <div className="text-center">
            <p className="mb-3 inline-flex rounded-full border border-entron-blue/20 bg-entron-blue/10 px-3 py-1 text-xs font-medium text-blue-300">
              Step 4 — Generate and export
            </p>
            <h2 className="text-3xl font-semibold text-slate-100 sm:text-4xl">Your personalized cards</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
              Generate a card with each selected guest&apos;s name and unique QR code, then preview and export the results.
            </p>
          </div>

          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-100">Generate cards for {selectedGuests.length} selected guests</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Design: {template?.name ?? (templateName || "No saved design")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {generating ? (
                  <button onClick={cancelGeneration} className="btn-secondary text-sm">
                    Stop after current batch
                  </button>
                ) : (
                  <button
                    onClick={() => generateCards()}
                    disabled={!template || !selectedGuests.length}
                    className="btn-primary text-sm"
                  >
                    <RefreshCw className="h-4 w-4" /> {cardsReady.length ? "Generate / regenerate" : "Generate cards"}
                  </button>
                )}
              </div>
            </div>
            {generating && (
              <div className="space-y-2" role="status" aria-live="polite">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Generating cards in batches</span>
                  <span>{generationProgress.completed} / {generationProgress.total}</span>
                </div>
                <progress
                  className="h-2 w-full accent-blue-500"
                  max={generationProgress.total}
                  value={generationProgress.completed}
                />
              </div>
            )}
            {generationResult && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300">
                <span>{generationResult.generated} generated · {generationResult.failed} failed</span>
                {generationResult.failedGuestIds.length > 0 && !generating && (
                  <button onClick={() => generateCards(generationResult.failedGuestIds)} className="btn-secondary text-xs">
                    Retry failed ({generationResult.failedGuestIds.length})
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-entron-dark-border pt-4">
              <p className="text-sm text-slate-400">
                {cardsReady.length} card{cardsReady.length === 1 ? "" : "s"} ready for {guests.length} event guest{guests.length === 1 ? "" : "s"}.
              </p>
              <div className="flex flex-wrap gap-2">
                {cardsReady.length ? (
                  <Link href={`/events/${eventId}/cards/print`} className="btn-secondary text-sm">
                    <Printer className="h-4 w-4" /> Print / PDF
                  </Link>
                ) : (
                  <button type="button" disabled className="btn-secondary text-sm">
                    <Printer className="h-4 w-4" /> Print / PDF
                  </button>
                )}
                {cardsReady.length ? (
                  <a href={`/api/v1/events/${eventId}/invitations/download-zip`} className="btn-secondary text-sm">
                    <Download className="h-4 w-4" /> Download ZIP
                  </a>
                ) : (
                  <button type="button" disabled className="btn-secondary text-sm">
                    <Download className="h-4 w-4" /> Download ZIP
                  </button>
                )}
              </div>
            </div>
          </section>

          {cardsReady.length > 0 ? (
            <section className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-100">Personalized cards ({cardsReady.length}/{guests.length})</h3>
                <a href={`/api/v1/events/${eventId}/invitations/download-zip`} className="btn-secondary text-sm">
                  <Download className="h-4 w-4" /> Download all
                </a>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {cardsReady.slice(0, 100).map((item) => {
                  const invitation = item.invitations?.[0];
                  return (
                    <div key={item.id} className="overflow-hidden rounded-xl border border-entron-dark-border bg-slate-800">
                      <a href={invitation?.cardUrl ?? "#"} target="_blank" rel="noreferrer" aria-label={`Open card for ${item.firstName} ${item.lastName}`}>
                        <img src={invitation?.cardUrl ?? ""} alt={`Card for ${item.firstName} ${item.lastName}`} className="aspect-[3/4] w-full object-cover" />
                      </a>
                      <div className="space-y-2 p-2">
                        <p className="truncate text-xs font-medium text-slate-100">{item.firstName} {item.lastName}</p>
                        {invitation?.cardUrl && (
                          <a href={invitation.cardUrl} download={`${safeFileName(item.firstName)}-${safeFileName(item.lastName)}-${item.id.slice(0, 8)}.jpg`} className="btn-secondary w-full justify-center text-xs">
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {cardsReady.length > 100 && (
                <p className="text-sm text-slate-400">
                  Showing the first 100 previews. ZIP and print/PDF exports include all {cardsReady.length} cards.
                </p>
              )}
            </section>
          ) : (
            <div className="card py-10 text-center">
              <h3 className="font-semibold text-slate-100">No cards generated yet</h3>
              <p className="mt-2 text-sm text-slate-400">
                Generate cards to preview and download the selected guests&apos; personalized designs.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setWorkflowStep("guests")} className="btn-secondary text-sm">
              <ArrowLeft className="h-4 w-4" /> Back to guests
            </button>
            <button type="button" onClick={() => setWorkflowStep("upload")} className="btn-secondary text-sm">
              Choose another design
            </button>
          </div>
        </section>
      )}

    </div>
  );
}

function boundedNumber(value: string, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "guest";
}

function apiError(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: string; message?: string } } }).response;
    if (response?.data?.error) return response.data.error;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error ? error.message : fallback;
}
