import { useEffect, useState } from 'preact/hooks';
import { limpiarCache, supabase } from './api';

export type Etapa = 'cargando' | 'login' | 'enrolar' | 'mfa' | 'ok';

/** Determina en qué paso está el usuario: sin sesión, sin factor TOTP, falta el 2º factor o listo (aal2). */
export async function etapaActual(): Promise<Etapa> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'login';
  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return 'login';
  if (aal.currentLevel === 'aal2') return 'ok';
  const { data: f } = await supabase.auth.mfa.listFactors();
  const verificado = f?.totp?.some((x) => x.status === 'verified');
  return verificado ? 'mfa' : 'enrolar';
}

export function useEtapa(): [Etapa, () => void] {
  const [e, set] = useState<Etapa>('cargando');
  const refrescar = () => { etapaActual().then(set).catch(() => set('login')); };
  useEffect(() => {
    refrescar();
    const { data } = supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { limpiarCache(); set('login'); } });
    return () => data.subscription.unsubscribe();
  }, []);
  return [e, refrescar];
}

function Marco({ titulo, sub, children }: { titulo: string; sub?: string; children: any }) {
  return (
    <main class="auth">
      <div>
        <div class="eyebrow">CuidaTusFinanzas</div>
        <h1>{titulo}</h1>
        {sub && <p class="muted" style="margin:6px 0 0">{sub}</p>}
      </div>
      {children}
    </main>
  );
}

export function Login({ listo }: { listo: () => void }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const enviar = async (e: Event) => {
    e.preventDefault(); setBusy(true); setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);
    if (error) { setMsg('No pudimos entrar. Revisá el mail y la contraseña.'); return; }
    listo();
  };
  return (
    <Marco titulo="Entrar" sub="Tu liquidez de hoy y de los próximos 90 días.">
      <form onSubmit={enviar} style="display:flex;flex-direction:column;gap:14px" data-testid="login">
        <label>Mail<input type="email" autocomplete="username" required value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} /></label>
        <label>Contraseña<input type="password" autocomplete="current-password" required value={pass} onInput={(e) => setPass((e.target as HTMLInputElement).value)} /></label>
        {msg && <div class="msg" role="alert">{msg}</div>}
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </Marco>
  );
}

function CampoCodigo({ onCodigo, busy, msg, boton }: { onCodigo: (c: string) => void; busy: boolean; msg: string; boton: string }) {
  const [c, setC] = useState('');
  return (
    <form style="display:flex;flex-direction:column;gap:14px" onSubmit={(e) => { e.preventDefault(); onCodigo(c); }}>
      <label>Código de 6 dígitos
        <input class="code num" inputMode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
          value={c} onInput={(e) => setC((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
      </label>
      {msg && <div class="msg" role="alert">{msg}</div>}
      <button class="btn" type="submit" disabled={busy || c.length !== 6}>{busy ? 'Verificando…' : boton}</button>
    </form>
  );
}

export function Enrolar({ listo }: { listo: () => void }) {
  const [f, setF] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      // Limpia factores TOTP sin verificar de intentos anteriores.
      const { data } = await supabase.auth.mfa.listFactors();
      for (const x of data?.all ?? []) if (x.factor_type === 'totp' && x.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: x.id });
      const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'CuidaTusFinanzas' });
      if (error || !e) { setMsg('No pudimos generar el código QR. Probá de nuevo.'); return; }
      setF({ id: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
    })();
  }, []);
  const verificar = async (code: string) => {
    if (!f) return;
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
    setBusy(false);
    if (error) { setMsg('El código no coincide. Fijate que la hora del teléfono esté bien.'); return; }
    listo();
  };
  return (
    <Marco titulo="Activá el segundo factor" sub="Es obligatorio. Escaneá el QR con tu app de autenticación (Google Authenticator, Authy, etc.) y escribí el código.">
      {f ? <>
        <div class="qr"><img src={f.qr} alt="Código QR para la app de autenticación" /></div>
        <div class="small">¿No podés escanear? Cargá esta clave a mano:</div>
        <div class="secret">{f.secret}</div>
        <CampoCodigo onCodigo={verificar} busy={busy} msg={msg} boton="Activar" />
      </> : msg ? <div class="msg" role="alert">{msg}</div> : <div class="small">Generando el QR…</div>}
      <BotonSalir />
    </Marco>
  );
}

export function Desafio({ listo }: { listo: () => void }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const verificar = async (code: string) => {
    setBusy(true); setMsg('');
    const { data } = await supabase.auth.mfa.listFactors();
    const f = data?.totp?.find((x) => x.status === 'verified');
    if (!f) { setBusy(false); listo(); return; }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
    setBusy(false);
    if (error) { setMsg('El código no coincide. Probá con el siguiente.'); return; }
    listo();
  };
  return (
    <Marco titulo="Código de verificación" sub="Abrí tu app de autenticación y escribí el código de CuidaTusFinanzas.">
      <CampoCodigo onCodigo={verificar} busy={busy} msg={msg} boton="Verificar" />
      <BotonSalir />
    </Marco>
  );
}

export function BotonSalir({ icono }: { icono?: any }) {
  return icono
    ? <button class="iconbtn" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => supabase.auth.signOut()}>{icono}</button>
    : <button class="btn sec" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>;
}
