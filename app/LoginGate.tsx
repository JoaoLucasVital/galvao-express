"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import Image from "next/image";
import * as m from "motion/react-m";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import styles from "./LoginGate.module.css";
import ThemeToggle from "./ThemeToggle";

const loginVideoUrl = process.env.NEXT_PUBLIC_LOGIN_VIDEO_URL;
const LAST_ACTIVITY_KEY = "galvao-express-last-activity";
const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const ACTIVITY_PERSIST_INTERVAL_MS = 30 * 1000;
const SESSION_REFRESH_INTERVAL_MS = 60 * 1000;

export default function LoginGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "locked" | "open">("loading");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const mediaLayerRef = useRef<HTMLDivElement>(null);
  const depthBackdropRef = useRef<HTMLDivElement>(null);
  const routeTraceRef = useRef<HTMLDivElement>(null);
  const cityGlowRef = useRef<HTMLDivElement>(null);
  const techGridRef = useRef<HTMLDivElement>(null);
  const lightSweepRef = useRef<HTMLDivElement>(null);
  const signalNodesRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const sessionExpiredRef = useRef(false);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => {
        if (response.ok) {
          setStatus("open");
          return;
        }
        window.localStorage.removeItem(LAST_ACTIVITY_KEY);
        setStatus("locked");
      })
      .catch(() => setStatus("locked"));
  }, []);

  useEffect(() => {
    if (status === "locked") inputRef.current?.focus();
  }, [status]);
  useEffect(() => {
    if (status !== "open") return;

    sessionExpiredRef.current = false;
    let idleTimer: number | undefined;
    let lastPersistedAt = 0;
    let lastSessionRefreshAt = 0;
    let lastActivityAt = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));

    const expireSession = async () => {
      if (sessionExpiredRef.current) return;
      sessionExpiredRef.current = true;
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        setPin("");
        setShowPin(false);
        setError("Sua sessão expirou após 20 minutos sem atividade. Digite o PIN novamente.");
        setStatus("locked");
      }
    };

    const scheduleExpiration = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      const remaining = Math.max(250, lastActivityAt + IDLE_TIMEOUT_MS - Date.now());
      idleTimer = window.setTimeout(() => void expireSession(), remaining);
    };

    const refreshServerSession = () => {
      const now = Date.now();
      if (now - lastSessionRefreshAt < SESSION_REFRESH_INTERVAL_MS) return;
      lastSessionRefreshAt = now;
      void fetch("/api/auth/session", { method: "POST", cache: "no-store" })
        .then((response) => {
          if (!response.ok) void expireSession();
        })
        .catch(() => {
          // A próxima atividade tentará renovar novamente sem interromper o uso offline.
          lastSessionRefreshAt = 0;
        });
    };

    const registerActivity = (forcePersist = false) => {
      if (document.hidden && !forcePersist) return;
      const now = Date.now();
      lastActivityAt = now;
      scheduleExpiration();
      if (forcePersist || now - lastPersistedAt >= ACTIVITY_PERSIST_INTERVAL_MS) {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        lastPersistedAt = now;
      }
      refreshServerSession();
    };

    const storedActivityIsValid = Number.isFinite(lastActivityAt) && lastActivityAt > 0;
    if (storedActivityIsValid && Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
      void expireSession();
      return;
    }

    registerActivity(true);

    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    const handleActivity = () => registerActivity();
    const handleVisibility = () => {
      if (document.hidden) return;
      const stored = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
      if (Number.isFinite(stored) && stored > 0 && Date.now() - stored >= IDLE_TIMEOUT_MS) {
        void expireSession();
        return;
      }
      registerActivity(true);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY) return;
      if (!event.newValue) {
        void expireSession();
        return;
      }
      const sharedActivity = Number(event.newValue);
      if (Number.isFinite(sharedActivity) && sharedActivity > lastActivityAt) {
        lastActivityAt = sharedActivity;
        scheduleExpiration();
      }
    };

    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("storage", handleStorage);

    return () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("storage", handleStorage);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "locked" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let disposed = false;
    let cleanup = () => {};

    void import("gsap").then(({ gsap }) => {
      if (disposed || !heroRef.current) return;
      const context = gsap.context(() => {
        const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
        timeline
          .fromTo(depthBackdropRef.current, { opacity: 0, scale: 1.08 }, { opacity: .64, scale: 1.035, duration: .85 }, 0)
          .fromTo(mediaLayerRef.current, { opacity: 0, xPercent: 7, scale: 1.035 }, { opacity: 1, xPercent: 0, scale: 1, duration: .9 }, .04)
          .fromTo(routeTraceRef.current, { opacity: 0, scaleX: 0 }, { opacity: .9, scaleX: 1, duration: .72 }, .16)
          .fromTo(cityGlowRef.current, { opacity: 0 }, { opacity: 1, duration: .58 }, .2)
          .fromTo(techGridRef.current, { opacity: 0, y: 10 }, { opacity: .72, y: 0, duration: .5 }, .28)
          .fromTo(signalNodesRef.current?.children ?? [], { opacity: 0, scale: .7 }, { opacity: .7, scale: 1, duration: .42, stagger: .08 }, .3)
          .fromTo([badgeRef.current, statsRef.current], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .42, stagger: .07 }, .34);

        gsap.to(cityGlowRef.current, { opacity: .68, duration: 2.8, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 1.05 });
        gsap.to(techGridRef.current, { backgroundPosition: "92px 92px", duration: 18, repeat: -1, ease: "none" });
        gsap.fromTo(routeTraceRef.current, { backgroundPosition: "0% 50%" }, { backgroundPosition: "200% 50%", duration: 3.4, repeat: -1, ease: "none", delay: 1 });
        gsap.fromTo(lightSweepRef.current, { xPercent: -180, opacity: 0 }, { xPercent: 420, opacity: .46, duration: 4.8, repeat: -1, repeatDelay: 1.4, ease: "power1.inOut", delay: 1.2 });
        gsap.to(signalNodesRef.current?.children ?? [], { opacity: .95, scale: 1.24, duration: .72, stagger: .34, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 1.15 });
      }, screenRef);

      const hero = heroRef.current;
      const desktopPointer = window.matchMedia("(min-width: 900px) and (pointer: fine)").matches;
      let handlePointerMove: ((event: PointerEvent) => void) | undefined;
      let handlePointerLeave: (() => void) | undefined;

      if (hero && desktopPointer && mediaLayerRef.current && depthBackdropRef.current && techGridRef.current) {
        const mediaX = gsap.quickTo(mediaLayerRef.current, "x", { duration: .55, ease: "power3.out" });
        const mediaY = gsap.quickTo(mediaLayerRef.current, "y", { duration: .55, ease: "power3.out" });
        const backdropX = gsap.quickTo(depthBackdropRef.current, "x", { duration: .8, ease: "power3.out" });
        const backdropY = gsap.quickTo(depthBackdropRef.current, "y", { duration: .8, ease: "power3.out" });
        const techX = gsap.quickTo(techGridRef.current, "x", { duration: .45, ease: "power3.out" });
        const techY = gsap.quickTo(techGridRef.current, "y", { duration: .45, ease: "power3.out" });

        handlePointerMove = (event) => {
          const bounds = hero.getBoundingClientRect();
          const x = (event.clientX - bounds.left) / bounds.width - .5;
          const y = (event.clientY - bounds.top) / bounds.height - .5;
          mediaX(x * 8); mediaY(y * 5);
          backdropX(x * -4); backdropY(y * -3);
          techX(x * 12); techY(y * 8);
        };
        handlePointerLeave = () => {
          mediaX(0); mediaY(0); backdropX(0); backdropY(0); techX(0); techY(0);
        };
        hero.addEventListener("pointermove", handlePointerMove);
        hero.addEventListener("pointerleave", handlePointerLeave);
      }

      cleanup = () => {
        if (hero && handlePointerMove) hero.removeEventListener("pointermove", handlePointerMove);
        if (hero && handlePointerLeave) hero.removeEventListener("pointerleave", handlePointerLeave);
        context.revert();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [status]);

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin.length !== 4) {
      setError("Digite os 4 números do PIN.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        setError("PIN incorreto. Verifique e tente novamente.");
        setPin("");
        inputRef.current?.focus();
        return;
      }
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      setStatus("open");
    } catch {
      setError("Não foi possível entrar agora. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "open") return children;

  return (
    <m.main ref={screenRef} className={styles.screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <ThemeToggle className={styles.themeToggle} />
      <m.section className={styles.formSide} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.42 }}>
        <div className={styles.formInner}>
          <m.div className={styles.brand} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <div className={styles.brandMark}><ArrowUpRight size={23} strokeWidth={2.8} /></div>
            <div><strong>Galvão <b>Express</b></strong><span>Fretes e comissões</span></div>
          </m.div>

          {status === "loading" ? (
            <LoginSkeleton />
          ) : (
            <m.div className={styles.loginContent} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.42 }}>
              <div className={styles.accessTag}><Zap size={13} /> Controle pessoal</div>
              <div className={styles.heading}>
                <h1>Bem-vindo de volta.</h1>
                <p>Entre com seu PIN para acompanhar seus fretes e comissões.</p>
              </div>

              <form onSubmit={enter} className={styles.form}>
                <label htmlFor="access-pin">PIN de acesso</label>
                <m.div className={`${styles.pinField} ${error ? styles.invalid : ""}`} animate={error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.34 }}>
                  <LockKeyhole size={19} aria-hidden="true" />
                  <input
                    ref={inputRef}
                    id="access-pin"
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    autoComplete="current-password"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={pin}
                    onChange={(event) => {
                      setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
                      setError("");
                    }}
                    placeholder="••••"
                    aria-describedby={error ? "pin-error" : "pin-help"}
                    aria-invalid={Boolean(error)}
                  />
                  <button type="button" onClick={() => setShowPin((value) => !value)} aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}>
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </m.div>
                <div className={styles.fieldMessage}>
                  {error
                    ? <p id="pin-error"><span>!</span>{error}</p>
                    : <small id="pin-help">Acesso de quatro dígitos</small>}
                  <span className={styles.pinProgress} aria-label={`${pin.length} de 4 dígitos preenchidos`}>
                    {[0, 1, 2, 3].map((index) => <i className={index < pin.length ? styles.filled : ""} key={index} />)}
                  </span>
                </div>
                <m.button className={styles.submit} type="submit" disabled={submitting || pin.length !== 4} whileTap={{ scale: 0.985 }}>
                  {submitting ? <><span className={styles.spinner} /> Verificando acesso...</> : <>Entrar no sistema <ArrowRight size={19} /></>}
                </m.button>
              </form>

              <div className={styles.trustRow}>
                <span><ShieldCheck size={15} /> Sessão protegida</span>
                <span><CheckCircle2 size={15} /> Acesso interno</span>
              </div>
            </m.div>
          )}

          <footer className={styles.footer}>Galvão Express · Seus fretes e ganhos em um só lugar.</footer>
        </div>
      </m.section>

      <section ref={heroRef} className={styles.mediaSide} aria-label="Identidade visual da Galvão Express">
        <div ref={depthBackdropRef} className={styles.depthBackdrop} aria-hidden="true" />
        <div ref={mediaLayerRef} className={styles.mediaLayer}>
          {loginVideoUrl ? (
            <video className={styles.media} autoPlay muted loop playsInline poster="/login-hero-truck.webp" preload="metadata">
              <source src={loginVideoUrl} />
            </video>
          ) : (
            <Image
              className={styles.media}
              src="/login-hero-truck.webp"
              alt="Caminhão Galvão Express em uma rota urbana tecnológica"
              fill
              priority
              quality={86}
              sizes="(max-width: 760px) 100vw, 58vw"
            />
          )}
        </div>
        <div ref={cityGlowRef} className={styles.cityGlow} aria-hidden="true" />
        <div ref={techGridRef} className={styles.techGrid} aria-hidden="true" />
        <div ref={routeTraceRef} className={styles.routeTrace} aria-hidden="true" />
        <div ref={lightSweepRef} className={styles.lightSweep} aria-hidden="true" />
        <div ref={signalNodesRef} className={styles.signalNodes} aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className={styles.mediaShade} />
        <div ref={badgeRef} className={styles.mediaBadge}><Sparkles size={14} /><span>Visual ilustrativo preparado para receber a foto real da frota</span></div>
        <div ref={statsRef} className={styles.mediaStats} aria-hidden="true">
          <div><span>Rota</span><strong>A → B</strong></div>
          <i />
          <div><span>Operação</span><strong>Monitorada</strong></div>
        </div>
      </section>
    </m.main>
  );
}

function LoginSkeleton() {
  return (
    <div className={styles.skeleton} aria-label="Preparando acesso">
      <div className={styles.skeletonTag} />
      <div className={styles.skeletonTitle} />
      <div className={styles.skeletonCopy} />
      <div className={styles.skeletonInput} />
      <div className={styles.skeletonButton} />
    </div>
  );
}
