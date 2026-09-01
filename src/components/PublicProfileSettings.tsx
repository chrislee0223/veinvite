'use client';

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { PROFILE_COPY } from '@/lib/i18n/profileCopy';
import type { Locale } from '@/lib/i18n/locales';
import {
  PUBLIC_PROFILE_MAX_AVATAR_BYTES,
  PUBLIC_PROFILE_MAX_NAME_LENGTH,
  type PublicWalletProfile,
} from '@/lib/publicProfile';

function fallbackLabel(
  displayName: string,
  wallet: string,
) {
  const source = displayName.trim() || wallet.slice(2, 4).toUpperCase();
  return Array.from(source)[0]?.toUpperCase() ?? 'V';
}

export function PublicProfileSettings({
  locale,
  wallet,
}: {
  locale: Locale;
  wallet: string | null;
}) {
  const t = PROFILE_COPY[locale];
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [profile, setProfile] = useState<PublicWalletProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const publishProfile = useCallback((next: PublicWalletProfile) => {
    setProfile(next);
    setDisplayName(next.displayName ?? '');
    window.dispatchEvent(
      new CustomEvent('veinvite-profile-updated', { detail: next }),
    );
  }, []);

  const loadProfile = useCallback(async () => {
    if (!wallet) {
      setProfile(null);
      setDisplayName('');
      setError('');
      setMessage('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/profile', { cache: 'no-store' });
      const body = (await response.json()) as PublicWalletProfile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? t.loadError);
      publishProfile(body);
    } catch (loadError) {
      console.error('Public profile load failed:', loadError);
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [publishProfile, t.loadError, wallet]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveName = async () => {
    if (!wallet || savingName) return;
    setSavingName(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      const body = (await response.json()) as PublicWalletProfile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? t.saveError);
      publishProfile(body);
      setMessage(t.saved);
    } catch (saveError) {
      console.error('Public profile name save failed:', saveError);
      setError(t.saveError);
    } finally {
      setSavingName(false);
    }
  };

  const uploadAvatar = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !wallet || uploading) return;

    if (
      file.size < 1 ||
      file.size > PUBLIC_PROFILE_MAX_AVATAR_BYTES ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    ) {
      setMessage('');
      setError(t.imageHelp);
      return;
    }

    setUploading(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.set('avatar', file);
      const response = await fetch('/api/profile', {
        method: 'POST',
        body: form,
      });
      const body = (await response.json()) as PublicWalletProfile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? t.saveError);
      publishProfile(body);
      setMessage(t.saved);
    } catch (uploadError) {
      console.error('Public profile avatar upload failed:', uploadError);
      setError(t.saveError);
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!wallet || uploading || !profile?.avatarUrl) return;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/profile', { method: 'DELETE' });
      const body = (await response.json()) as PublicWalletProfile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? t.saveError);
      publishProfile(body);
      setMessage(t.saved);
    } catch (removeError) {
      console.error('Public profile avatar removal failed:', removeError);
      setError(t.saveError);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="publicProfileCard" aria-busy={loading || savingName || uploading}>
      <div className="profileHeading">
        <div>
          <h2>{t.title}</h2>
          <p>{t.note}</p>
        </div>
        {wallet ? (
          <span className="profileAvatar" aria-hidden="true">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" />
            ) : (
              fallbackLabel(displayName, wallet)
            )}
          </span>
        ) : null}
      </div>

      {!wallet ? (
        <p className="emptyProfile">{t.notConnected}</p>
      ) : (
        <>
          <div className="publicNotice">
            <strong>{t.publicNotice}</strong>
            <span>{t.fallback}</span>
          </div>

          <label className="fieldLabel" htmlFor="veinvite-profile-name">
            {t.nameLabel}
          </label>
          <div className="nameRow">
            <input
              id="veinvite-profile-name"
              value={displayName}
              maxLength={PUBLIC_PROFILE_MAX_NAME_LENGTH}
              autoComplete="off"
              placeholder={t.namePlaceholder}
              disabled={loading || savingName}
              onChange={(event) => setDisplayName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void saveName();
                }
              }}
            />
            <button
              type="button"
              className="saveButton"
              disabled={loading || savingName}
              onClick={() => void saveName()}
            >
              {savingName ? t.saving : t.saveName}
            </button>
          </div>

          <div className="avatarSection">
            <div>
              <strong>{t.imageLabel}</strong>
              <small>{t.imageHelp}</small>
            </div>
            <div className="avatarActions">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) => void uploadAvatar(event)}
              />
              <button
                type="button"
                className="photoButton"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? t.uploading : t.chooseImage}
              </button>
              {profile?.avatarUrl ? (
                <button
                  type="button"
                  className="removeButton"
                  disabled={uploading}
                  onClick={() => void removeAvatar()}
                >
                  {t.removeImage}
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}

      {message ? <p className="success" role="status">{message}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      <style jsx>{`
        .publicProfileCard {
          box-sizing:border-box;
          width:min(100%,520px);
          margin:18px auto 0;
          padding:19px;
          border:1px solid rgba(255,205,80,.14);
          border-radius:21px;
          background:rgba(255,255,255,.035);
          color:#f5f2e9;
        }
        .profileHeading {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
        }
        .profileHeading > div { min-width:0; }
        h2 { margin:0; font-size:1rem; letter-spacing:-.02em; }
        p { margin:7px 0 0; color:#8f8b83; font-size:.75rem; line-height:1.5; }
        .profileAvatar {
          flex:0 0 auto;
          width:48px;
          height:48px;
          display:grid;
          place-items:center;
          overflow:hidden;
          border:1px solid rgba(255,205,80,.22);
          border-radius:16px;
          background:linear-gradient(135deg,rgba(244,183,40,.2),rgba(255,255,255,.045));
          color:#ffd35c;
          font-size:1.1rem;
          font-weight:950;
        }
        .profileAvatar img { width:100%; height:100%; object-fit:cover; }
        .emptyProfile { margin-top:14px; }
        .publicNotice {
          margin-top:15px;
          padding:12px 13px;
          display:grid;
          gap:4px;
          border:1px solid rgba(255,205,80,.12);
          border-radius:14px;
          background:rgba(244,183,40,.055);
        }
        .publicNotice strong { color:#d7c999; font-size:.7rem; line-height:1.45; }
        .publicNotice span { color:#7f7a70; font-size:.66rem; line-height:1.45; }
        .fieldLabel {
          display:block;
          margin-top:16px;
          color:#a7a197;
          font-size:.7rem;
          font-weight:850;
        }
        .nameRow {
          margin-top:7px;
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          gap:8px;
        }
        input[type='text'], input:not([type]) { min-width:0; }
        .nameRow input {
          min-width:0;
          height:44px;
          box-sizing:border-box;
          padding:0 12px;
          border:1px solid rgba(255,255,255,.1);
          border-radius:13px;
          outline:none;
          background:#11120f;
          color:#f5f2e9;
          font:inherit;
          font-size:.78rem;
        }
        .nameRow input:focus { border-color:rgba(255,205,80,.48); box-shadow:0 0 0 3px rgba(244,183,40,.07); }
        .saveButton,.photoButton,.removeButton {
          min-height:44px;
          padding:0 13px;
          border-radius:13px;
          font:inherit;
          font-size:.72rem;
          font-weight:900;
          cursor:pointer;
        }
        .saveButton {
          border:0;
          background:linear-gradient(135deg,#ffd24d,#efa718);
          color:#17120a;
        }
        .avatarSection {
          margin-top:16px;
          padding-top:15px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          border-top:1px solid rgba(255,255,255,.07);
        }
        .avatarSection > div:first-child { min-width:0; display:grid; gap:3px; }
        .avatarSection strong { font-size:.72rem; }
        .avatarSection small { color:#777269; font-size:.63rem; line-height:1.35; }
        .avatarActions { flex:0 0 auto; display:flex; align-items:center; gap:7px; }
        .photoButton,.removeButton { min-height:38px; }
        .photoButton { border:1px solid rgba(255,205,80,.18); background:rgba(244,183,40,.07); color:#e8cf83; }
        .removeButton { border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.035); color:#a5a097; }
        button:disabled,input:disabled { opacity:.5; cursor:not-allowed; }
        .success { color:#71e9ae; }
        .error { color:#ff8d9d; }
        @media (max-width:420px) {
          .publicProfileCard { padding:16px; border-radius:19px; }
          .nameRow { grid-template-columns:1fr; }
          .saveButton { width:100%; }
          .avatarSection { align-items:flex-start; flex-direction:column; }
          .avatarActions { width:100%; }
          .photoButton,.removeButton { flex:1; }
        }
      `}</style>
    </section>
  );
}
