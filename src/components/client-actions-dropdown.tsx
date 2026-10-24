"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MoreVertical,
  Eye,
  PlusCircle,
  Pencil,
  Phone,
  MessageCircle,
  Trash2,
} from "lucide-react";
import { EditClientModal, type ClientDataForEdit } from "./edit-client-modal";
import { DeleteClientButton } from "./delete-client-button";

export function ClientActionsDropdown({
  client,
  loansCount = 0,
  canWrite = true,
}: {
  client: ClientDataForEdit;
  loansCount?: number;
  canWrite?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Formato para WhatsApp y llamada
  const cleanPhone = client.phone ? client.phone.replace(/\D/g, "") : "";
  const whatsappUrl = cleanPhone
    ? `https://wa.me/${cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone}`
    : null;
  const telUrl = cleanPhone ? `tel:${cleanPhone}` : null;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Botón de activación: 3 puntos verticales */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 shadow-2xs transition hover:bg-ink-50 hover:text-ink-900 active:scale-95 cursor-pointer"
        aria-label="Opciones del cliente"
        aria-expanded={isOpen}
      >
        <MoreVertical size={18} />
      </button>

      {/* Menú desplegable flotante */}
      {isOpen && (
        <div className="absolute right-0 z-40 mt-1.5 w-56 origin-top-right rounded-xl border border-ink-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
          <div className="border-b border-ink-100 px-3 py-2 text-left">
            <p className="font-semibold text-ink-900 text-xs truncate">
              {client.firstName} {client.lastName}
            </p>
            <p className="text-[11px] text-ink-500 font-mono">Doc. {client.documentId}</p>
          </div>

          <div className="py-1">
            {/* 1. Ver detalle */}
            <Link
              href={`/clients/${client.id}`}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition min-h-[38px]"
            >
              <Eye size={15} className="text-ink-500 shrink-0" />
              <span>Ver detalle y créditos</span>
            </Link>

            {/* 2. Nuevo Préstamo */}
            {canWrite && (
              <Link
                href={`/loans/new?clientId=${client.id}`}
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 hover:text-brand-900 transition min-h-[38px]"
              >
                <PlusCircle size={15} className="text-brand-600 shrink-0" />
                <span>Crear nuevo préstamo</span>
              </Link>
            )}

            {/* 3. Editar Cliente */}
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsEditOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition min-h-[38px] cursor-pointer"
              >
                <Pencil size={15} className="text-ink-500 shrink-0" />
                <span>Editar datos</span>
              </button>
            )}

            {/* 4. WhatsApp (Contacto Rápido) */}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900 transition min-h-[38px]"
              >
                <MessageCircle size={15} className="text-emerald-600 shrink-0" />
                <span>Enviar WhatsApp</span>
              </a>
            )}

            {/* 5. Llamada telefónica */}
            {telUrl && (
              <a
                href={telUrl}
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-50 hover:text-sky-900 transition min-h-[38px]"
              >
                <Phone size={15} className="text-sky-600 shrink-0" />
                <span>Llamar al celular</span>
              </a>
            )}
          </div>

          {/* 6. Eliminar Cliente */}
          {canWrite && (
            <div className="border-t border-ink-100 pt-1">
              <div
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center"
              >
                <DeleteClientButton
                  clientId={client.id}
                  clientName={`${client.firstName} ${client.lastName}`}
                  documentId={client.documentId}
                  loansCount={loansCount}
                  variant="menuItem"
                />
              </div>
            </div>
          )}
        </div>
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
