"use client";

import { Bookmark, Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { shortlistPlaceAction, type ShortlistState } from "@/app/search/actions";

const INITIAL_STATE: ShortlistState = { status: "idle" };

type ShortlistButtonProps = {
  placeId: string;
  category: string;
  location: string;
  region: string;
  shortlisted: boolean;
};

export function ShortlistButton(props: ShortlistButtonProps) {
  const [state, action, pending] = useActionState(shortlistPlaceAction, INITIAL_STATE);
  const saved = props.shortlisted || state.status === "saved";
  const title = state.status === "error" ? state.message : saved ? "Salvato nella shortlist" : "Salva nella shortlist";

  return (
    <form action={action} className="shortlist-action">
      <input type="hidden" name="placeId" value={props.placeId} />
      <input type="hidden" name="category" value={props.category} />
      <input type="hidden" name="location" value={props.location} />
      <input type="hidden" name="region" value={props.region} />
      <button className={`icon-button shortlist-button${state.status === "error" ? " shortlist-button-error" : ""}`} type="submit" disabled={pending || saved} title={title} aria-label={title}>
        {pending ? <LoaderCircle className="spin" size={16} /> : state.status === "error" ? <CircleAlert size={16} /> : saved ? <Check size={16} /> : <Bookmark size={16} />}
      </button>
      {state.status === "error" ? <span className="sr-only" role="alert">{state.message}</span> : null}
    </form>
  );
}
