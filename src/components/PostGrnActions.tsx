"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "./Form";
import { deleteGrnAction, postGrnAction } from "@/server/actions/grns";
import { useT } from "./LocaleProvider";

/** Post or discard a draft receipt. Posted receipts are immutable, so nothing is offered. */
export function PostGrnActions({
  grnId,
  vendorPoId,
  status,
}: {
  grnId: string;
  vendorPoId: string;
  status: string;
}) {
  const [postState, post] = useActionState(postGrnAction, null);
  const [deleteState, remove] = useActionState(deleteGrnAction, null);
  const t = useT();

  if (status === "POSTED") return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <form action={remove}>
          <input type="hidden" name="grnId" value={grnId} />
          <input type="hidden" name="vendorPoId" value={vendorPoId} />
          <SubmitButton className="btn-danger" pendingLabel={t.grn.discarding}>
            {t.grn.discardDraft}
          </SubmitButton>
        </form>
        <form action={post}>
          <input type="hidden" name="grnId" value={grnId} />
          <input type="hidden" name="vendorPoId" value={vendorPoId} />
          <SubmitButton pendingLabel={t.grn.posting}>{t.grn.postReceipt}</SubmitButton>
        </form>
      </div>
      <FormMessage state={postState ?? deleteState} />
    </div>
  );
}
