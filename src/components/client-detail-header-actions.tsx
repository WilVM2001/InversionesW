"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Phone, Pencil, PlusCircle } from "lucide-react";
import { EditClientModal, type ClientDataForEdit } from "./edit-client-modal";
import { DeleteClientButton } from "./delete-client-button";

export function ClientDetailHeaderActions({
  client,
  loansCount = 0,
  canWrite = true,
}: {
  client: ClientDataForEdit;
  loansCount?: number;
  canWrite?: boolean;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);

  const cleanPhone = client.phone ? client.phone.replace(/\D/g, "") : "";
  const whatsappUrl = cleanPhone
    ? `https://wa.me/${cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone}`
    : null;
  const telUrl = cleanPhone ? `tel:${cleanPhone}` : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Contacto Rápido */}
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 min-h-[38px]"
        >
          <MessageCircle size={15} className="text-emerald-600" />
          <span className="hidden sm:inline">WhatsApp</span>
        </a>
      )}

      {telUrl && (
        <a
          href={telUrl}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 min-h-[38px]"
        >
          <Phone size={15} className="text-sky-600" />
          <span className="hidden sm:inline">Llamar</span>
        </a>
      )}

      {/* Editar Cliente */}
      {canWrite && (
        <button
          type="button"
          onClick={() => setIsEditOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 shadow-2xs transition hover:bg-ink-50 hover:text-ink-900 cursor-pointer min-h-[38px]"
        >
          <Pencil size={14} />
          <span>Editar</span>
        </button>
      )}

      {/* Eliminar Cliente */}
      {canWrite && (
        <DeleteClientButton
          clientId={client.id}
          clientName={`${client.firstName} ${client.lastName}`}
          documentId={client.documentId}
          loansCount={loansCount}
          variant="button"
        />
      )}

      {/* Crear Préstamo */}
      {canWrite && (
        <Link
          href={`/loans/new?clientId=${client.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-700 min-h-[38px]"
        >
          <PlusCircle size={14} />
          <span>Nuevo préstamo</span>
        </Link>
      )}

      {/* Modal de edición */}
      <EditClientModal
        client={client}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />
    </div>
  );
}
