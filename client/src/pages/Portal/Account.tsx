import { type FormEvent, useEffect, useState } from 'react';
import { ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.js';
import { useAccount, useChangePassword, useUpdateAccount } from '../../hooks/useAccount.js';
import { PortalShell } from './PortalShell.js';
import './portal.css';

interface FormMsg { type: 'success' | 'error'; text: string; }

export function Account() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useAccount();
  const updateAccount = useUpdateAccount();
  const changePassword = useChangePassword();

  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [source, setSource] = useState('');
  const [profileMsg, setProfileMsg] = useState<FormMsg | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<FormMsg | null>(null);

  useEffect(() => {
    if (data) { setName(data.name); setBranch(data.branch); setSource(data.source); }
  }, [data]);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await updateAccount.mutateAsync({ name, branch, source });
      setProfileMsg({ type: 'success', text: 'Profile updated.' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err instanceof ApiError ? err.message : 'Failed to update profile' });
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPasswordMsg({ type: 'success', text: 'Password changed.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err instanceof ApiError ? err.message : 'Failed to change password' });
    }
  }

  return (
    <PortalShell name={user?.name ?? 'Jobseeker'}>
      {isLoading && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>Loading your account…</div>}
      {isError && (
        <div className="card" style={{ padding: 20, color: 'var(--danger)' }}>
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}
      {data && (
        <>
          <div className="portal-hero">
            <h1>Account</h1>
            <div className="sub">Update your profile details and password.</div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, margin: '0 0 16px' }}>Profile</h2>
            <form onSubmit={onSaveProfile}>
              <div className="fld">
                <label>Name</label>
                <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="fld">
                <label>Branch</label>
                <input aria-label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
              <div className="fld">
                <label>Source</label>
                <input aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} />
              </div>
              <div className="fld">
                <label>Email</label>
                <div className="acct-static">{data.email}</div>
              </div>
              <div className="fld">
                <label>Institute</label>
                <div className="acct-static">{data.institute}</div>
              </div>
              <div className="fld">
                <label>Graduation year</label>
                <div className="acct-static">{data.gradYear}</div>
              </div>
              <div className="fld">
                <label>CGPA</label>
                <div className="acct-static">{data.cgpa}</div>
              </div>
              {profileMsg && (
                <p role="alert" className={profileMsg.type === 'success' ? 'res-banner res-ok' : 'auth-error'}>{profileMsg.text}</p>
              )}
              <button className="btn btn-primary" type="submit" disabled={updateAccount.isPending}>
                {updateAccount.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, margin: '0 0 16px' }}>Change password</h2>
            <form onSubmit={onChangePassword}>
              <div className="fld">
                <label>Current password</label>
                <input
                  aria-label="Current password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="fld">
                <label>New password</label>
                <input
                  aria-label="New password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              {passwordMsg && (
                <p role="alert" className={passwordMsg.type === 'success' ? 'res-banner res-ok' : 'auth-error'}>{passwordMsg.text}</p>
              )}
              <button className="btn btn-primary" type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? 'Changing…' : 'Change password'}
              </button>
            </form>
          </div>
        </>
      )}
    </PortalShell>
  );
}
