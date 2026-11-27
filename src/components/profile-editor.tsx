"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client";
import { type AvatarRef } from "@/lib/avatar";
import { centeredPhoto, drawPhoto, exportPhoto, openPhoto, type PhotoCrop } from "@/lib/photo-crop";
import { Avatar } from "./ui";
import styles from "./profile-editor.module.css";

type Choice = { id: string; name: string };
type PhotoReview = {
  enabled: boolean;
  status: "none" | "pending" | "held" | "approved" | "rejected";
  photoId: string | null;
  photoHash: string | null;
};
type EditorProps = {
  name: string; bio: string; initialLink: string; hue: number; initialAvatar: AvatarRef; version: number;
  portraits: Choice[]; riotIcons: { id: number; name: string }[]; returnTo: string;
};
const featured = ["Ahri", "Ashe", "Ekko", "Jinx", "LeeSin", "Leona", "Lux", "Thresh"];

async function photoRequest(init?: RequestInit): Promise<PhotoReview> {
  const response = await fetch("/api/account/photo", { cache: "no-store", redirect: "error", ...init });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) throw new Error(result?.error ?? "Couldn’t check photo review. Try again.");
  return result;
}

function avatarKey(avatar: AvatarRef) {
  if (avatar.kind === "initials") return avatar.kind;
  return `${avatar.kind}/${avatar.id}${avatar.kind === "upload" ? "/" + avatar.hash : ""}`;
}

function CropPreview({ image, crop }: { image: HTMLImageElement; crop: PhotoCrop }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawPhoto(ref.current, image, crop); }, [image, crop]);
  return <canvas ref={ref} width={256} height={256} role="img" aria-label="Cropped profile picture preview" />;
}

function AvatarPreview({ avatar, initial, name, hue }: { avatar: AvatarRef; initial: AvatarRef; name: string; hue: number }) {
  if (avatar.kind === "upload" && avatarKey(avatar) !== avatarKey(initial)) {
    const url = `/api/account/photo/preview?id=${encodeURIComponent(avatar.id)}&v=${encodeURIComponent(avatar.hash)}`;
    return <Image unoptimized src={url} width={80} height={80} alt="Approved profile photo preview" />;
  }
  return <Avatar name={name} hue={hue} size={80} avatar={avatar} />;
}

export function ProfileEditor({ name, bio, initialLink, hue, initialAvatar, version, portraits, riotIcons, returnTo }: EditorProps) {
  const router = useRouter();
  const [displayName, setName] = useState(name);
  const [bioText, setBio] = useState(bio);
  const [profileLink, setLink] = useState(initialLink);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<PhotoCrop>(centeredPhoto);
  const [review, setReview] = useState<PhotoReview | null>(null);
  const [reviewError, setReviewError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [reading, setReading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const request = useRef(0);
  const saving = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const dirty = displayName.trim() !== name || bioText.trim() !== bio || profileLink.trim() !== initialLink || !!photo || avatarKey(avatar) !== avatarKey(initialAvatar);
  const searchText = search.trim().toLocaleLowerCase();
  const choices = searchText
    ? portraits.filter(c => c.name.toLocaleLowerCase().includes(searchText) || c.id.toLocaleLowerCase().includes(searchText)).slice(0, 24)
    : featured.flatMap(id => portraits.filter(c => c.id === id));

  useEffect(() => {
    const controller = new AbortController();
    photoRequest({ signal: controller.signal }).then(setReview).catch(() => {
      if (!controller.signal.aborted) setReviewError(true);
    });
    return () => controller.abort();
  }, []);

  function select(next: AvatarRef) {
    request.current++;
    setReading(false);
    setAvatar(next);
    setPhoto(null);
    setError("");
    setNotice(next.kind === "initials" ? "Your initials will appear after saving." : "Picture selected.");
    setPicking(false);
    changeButton.current?.focus();
  }

  async function chooseFile(selected: File | undefined) {
    if (!selected) return;
    const sequence = ++request.current;
    setReading(true);
    setError("");
    try {
      const image = await openPhoto(selected);
      if (sequence !== request.current) return;
      setPhoto(image);
      setCrop(centeredPhoto);
      setNotice("Adjust the crop, then select Done.");
    } catch (failure) {
      if (sequence === request.current) setError(failure instanceof Error ? failure.message : "Couldn’t open that photo.");
    } finally {
      if (sequence === request.current) setReading(false);
    }
  }

  async function checkReview() {
    setReviewError(false);
    try {
      setReview(await photoRequest());
    } catch {
      setReviewError(true);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || reading || saving.current || displayName.trim().length < 2) return;
    saving.current = true;
    setError("");
    setNotice("");
    setConfirmCancel(false);
    setBusy(photo ? "Checking photo…" : "Saving…");
    let next = avatar;
    let saved = false;
    try {
      if (photo) {
        const blob = await exportPhoto(photo, crop);
        const result = await photoRequest({ method: "POST", headers: { "Content-Type": blob.type }, body: blob });
        setReview(result);
        if (result.status !== "approved" || !result.photoId || !result.photoHash) {
          setPhoto(null);
          setPicking(true);
          setNotice(result.status === "held" || result.status === "pending"
            ? "Your photo is under review. Return here to choose it once approved. Your profile edits are still open."
            : "The photo couldn’t be approved. Choose a different picture.");
          return;
        }
        next = { kind: "upload", id: result.photoId, hash: result.photoHash };
        setPhoto(null);
        setAvatar(next);
        setBusy("Saving…");
      }
      const result = await postJson("/api/account/profile", {
        displayName: displayName.trim(), bio: bioText.trim(), profileLink: profileLink.trim(), profileVersion: version,
        ...(avatarKey(next) !== avatarKey(initialAvatar) && { avatar: next }),
      });
      if (!result.ok) {
        setError(result.data.error);
        setConflict(result.status === 409 && result.data.error.toLowerCase().includes("refresh"));
        return;
      }
      saved = true;
      router.replace(returnTo + "?updated=1");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The profile could not be saved. Try again.");
    } finally {
      if (!saved) {
        saving.current = false;
        setBusy("");
      }
    }
  }

  const staged = review?.status === "approved" && review.photoId && review.photoHash
    ? { kind: "upload" as const, id: review.photoId, hash: review.photoHash } : null;
  return (
    <form className={styles.editor} aria-busy={!!busy} onSubmit={save}>
      <header className={styles.toolbar}>
        <button type="button" disabled={!!busy} onClick={() => dirty ? setConfirmCancel(true) : router.push(returnTo)}>Cancel</button>
        <h1>Edit profile</h1>
        <button type="submit" className={styles.done} disabled={!dirty || !!busy || reading || displayName.trim().length < 2}>
          {busy || "Done"}
        </button>
      </header>
      {confirmCancel && <div className={styles.confirm} role="group" aria-label="Discard changes">
        <strong>Discard your edits?</strong>
        <button type="button" onClick={() => router.push(returnTo)}>Discard changes</button>
        <button type="button" onClick={() => setConfirmCancel(false)}>Keep editing</button>
      </div>}
      <fieldset className={styles.fields} disabled={!!busy}>
        <div className={styles.pictureRow}>
          <div className={styles.preview}>
            {photo ? <CropPreview image={photo} crop={crop} /> : <AvatarPreview avatar={avatar} initial={initialAvatar} name={displayName} hue={hue} />}
          </div>
          <div>
            <h2>Profile picture</h2>
            <button className={styles.link} ref={changeButton} type="button" aria-expanded={picking} aria-controls="picture-choices"
              onClick={() => setPicking(!picking)}>{picking ? "Close picture options" : "Change picture"}</button>
            {!picking && (review?.status === "held" || review?.status === "pending") && <p className={styles.hint}>Photo awaiting review</p>}
            {!picking && staged && avatarKey(staged) !== avatarKey(avatar) && <p className={styles.hint}>Reviewed photo ready to choose</p>}
            {(photo || avatar.kind !== "initials") && <button type="button" className={styles.remove} onClick={() => select({ kind: "initials" })}>Remove picture</button>}
          </div>
        </div>

        {picking && <div className={styles.choices} id="picture-choices">
          <label className={styles.label} htmlFor="find-portrait">Champion portraits</label>
          <input id="find-portrait" type="search" value={search} placeholder="Search champions" onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (choices.length === 1) select({ kind: "champion", id: choices[0].id });
            }} />
          <div className={styles.grid}>
            {choices.map(c => <button key={c.id} type="button" onClick={() => select({ kind: "champion", id: c.id })}
              aria-label={`Use ${c.name} portrait`} aria-pressed={!photo && avatar.kind === "champion" && c.id === avatar.id}>
              <Avatar name={c.name} hue={hue} size={44} avatar={{ kind: "champion", id: c.id }} />
              <span>{c.name}</span>
            </button>)}
          </div>
          {!choices.length && <p role="status" className={styles.hint}>No matching champions.</p>}
          {riotIcons.map(icon => <button type="button" className={styles.iconChoice} key={icon.id} onClick={() => select({ kind: "riot-icon", id: icon.id })}>
            <Avatar name={icon.name} hue={hue} size={36} avatar={{ kind: "riot-icon", id: icon.id }} />
            <span>Use League icon<small>{icon.name}</small></span>
          </button>)}

          <div className={styles.personal}>
            <h3>Personal photo</h3>
            {review?.enabled ? <>
              <input hidden type="file" ref={file} accept="image/jpeg,image/png,image/webp" aria-label="Personal photo file"
                onChange={e => { void chooseFile(e.target.files?.[0]); e.target.value = ""; }}/>
              <button type="button" className={styles.link} onClick={() => file.current?.click()}>{reading ? "Opening photo…" : "Choose a photo"}</button>
              <small>Choose a JPEG, PNG or WebP up to 10 MB. Done sends your cropped picture for a safety check.</small>
            </> : reviewError ? <p>Photo options couldn’t load. <button type="button" className={styles.link} onClick={checkReview}>Try again</button></p>
              : <p className={styles.hint}>{review ? "Personal photo uploads are unavailable right now." : "Checking photo availability…"}</p>}
            {(review?.status === "pending" || review?.status === "held") && <p role="status">Your photo is awaiting review. <button type="button" className={styles.link} onClick={checkReview}>Check review</button></p>}
            {review?.status === "rejected" && <p className={styles.hint}>Your previous photo was declined.</p>}
            {staged && avatarKey(staged) !== avatarKey(avatar) && <button type="button" className={styles.link} onClick={() => select(staged)}>Use reviewed photo</button>}
            <p><Link href="/me/safety#uploaded-photos" className={styles.link}>Manage uploaded photos</Link></p>
          </div>
        </div>}
        {photo && <div className={styles.crop}>
          <h3>Adjust crop</h3>
          {(["zoom", "x", "y"] as const).map(axis => <label key={axis}>
            <span>{axis === "zoom" ? "Zoom" : axis === "x" ? "Horizontal position" : "Vertical position"}</span>
            <input type="range" min={axis === "zoom" ? 1 : 0} max={axis === "zoom" ? 3 : 100} step={axis === "zoom" ? .1 : 1}
              value={crop[axis]} onChange={e => setCrop(old => ({ ...old, [axis]: Number(e.target.value) }))} />
          </label>)}
          <button type="button" className={styles.link} onClick={() => setCrop(centeredPhoto)}>Reset crop</button>
          <button type="button" className={styles.remove} onClick={() => { setPhoto(null); setNotice("Photo selection cancelled."); }}>Discard selected photo</button>
        </div>}
        <div className={styles.field}>
          <label htmlFor="profile-name">Display name</label>
          <input id="profile-name" minLength={2} maxLength={40} required value={displayName} onChange={e => setName(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="profile-bio">Bio</label>
          <textarea id="profile-bio" rows={3} maxLength={280} value={bioText} onChange={e => setBio(e.target.value)} placeholder="Roles, champions or when you play…" />
          <small className={styles.counter}>{bioText.length}/280</small>
        </div>
        <div className={styles.field}>
          <label htmlFor="profile-link">Link</label>
          <input id="profile-link" value={profileLink} maxLength={500} onChange={e => setLink(e.target.value)}
            placeholder="/rooms/general" aria-describedby="profile-link-help" autoCapitalize="none" spellCheck={false} />
          <small id="profile-link-help" className={styles.hint}>Feature a community post or room. Paste its link here.</small>
        </div>
      </fieldset>
      <div aria-live="polite" className={styles.message}>{busy || notice || (dirty ? "Unsaved changes" : "")}</div>
      {error && <div className="notice err" role="alert">{error}
        {conflict && <> <button type="button" className={styles.link} onClick={() => window.location.reload()}>Reload saved profile</button></>}
      </div>}
    </form>
  );
}
