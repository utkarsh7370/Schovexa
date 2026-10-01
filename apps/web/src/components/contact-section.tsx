'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { contactMessageSchema, type ContactMessageInput, type ContactTopic } from '@schovexa/validation';
import { Alert, Button, Reveal, TextAreaField, TextField } from '@schovexa/ui';
import {
  Building2,
  Clock,
  CreditCard,
  LifeBuoy,
  Handshake,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  PlayCircle,
  Send,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api-client';
import { applyServerErrors } from '../lib/forms';

const TOPICS: { value: ContactTopic; label: string; icon: LucideIcon }[] = [
  { value: 'DEMO', label: 'Book a demo', icon: PlayCircle },
  { value: 'PRICING', label: 'Pricing', icon: CreditCard },
  { value: 'SUPPORT', label: 'Support', icon: LifeBuoy },
  { value: 'PARTNERSHIP', label: 'Partnership', icon: Handshake },
  { value: 'OTHER', label: 'Something else', icon: MessagesSquare },
];

const PERKS = [
  { icon: Clock, title: 'Quick replies', text: 'We answer every message personally, usually within one working day.' },
  { icon: PlayCircle, title: 'Free guided demo', text: 'See Schovexa with your own class and fee structure, not a canned tour.' },
  { icon: ShieldCheck, title: 'Your details stay private', text: 'We only use what you send to reply to you. No newsletters, no sharing.' },
];

const MAX_MESSAGE = 2000;

export function ContactSection() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactMessageInput>({
    resolver: zodResolver(contactMessageSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', phone: '', organization: '', topic: 'DEMO', message: '', website: '' },
  });
  const topic = watch('topic');
  const messageLength = (watch('message') ?? '').length;

  const onSubmit = async (data: ContactMessageInput) => {
    setServerError(null);
    try {
      await api.post('/contact', data);
      setSentTo(data.name.split(' ')[0] ?? data.name);
      reset();
    } catch (err) {
      setServerError(
        applyServerErrors(err, setError, { fallback: 'We could not send your message. Please try again in a moment.' }),
      );
    }
  };

  return (
    <section id="contact" className="relative scroll-mt-20 overflow-hidden bg-slate-50/70 px-6 py-24">
      <div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 animate-blob rounded-full bg-brand-electric/15 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 animate-blob rounded-full bg-brand-violet/15 blur-3xl [animation-delay:-6s]" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-blue">Contact us</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Let&apos;s talk about your school.</h2>
          <p className="mt-4 text-slate-600">Questions, a demo request or a partnership idea — send us a note and we&apos;ll get back to you.</p>
        </Reveal>

        <div className="mt-14 grid overflow-hidden rounded-3xl shadow-elevated lg:grid-cols-5">
          {/* Left: the pitch */}
          <Reveal className="relative lg:col-span-2">
            <div className="relative h-full overflow-hidden bg-brand-gradient-dark p-8 text-white sm:p-10">
              <div className="bg-grid-light pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 animate-float rounded-full bg-brand-electric/30 blur-3xl" aria-hidden="true" />
              <div className="relative">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/25">
                  <MessageCircle size={26} />
                </span>
                <h3 className="mt-6 text-2xl font-extrabold leading-tight">We&apos;d love to hear from you.</h3>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Tell us about your school — size, what you use today, what hurts the most — and we&apos;ll show you how Schovexa fits.
                </p>
                <ul className="mt-8 space-y-5">
                  {PERKS.map((perk) => (
                    <li key={perk.title} className="group flex items-start gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20 transition-all duration-300 group-hover:scale-110 group-hover:bg-white/20">
                        <perk.icon size={18} />
                      </span>
                      <div>
                        <p className="font-semibold">{perk.title}</p>
                        <p className="mt-0.5 text-sm leading-6 text-white/65">{perk.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          {/* Right: the form */}
          <Reveal delay={120} className="lg:col-span-3">
            <div className="h-full bg-white p-8 sm:p-10">
              {sentTo ? (
                <div role="status" className="flex h-full min-h-[26rem] flex-col items-center justify-center text-center">
                  <span className="relative flex h-24 w-24 animate-pop items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <span className="absolute inset-0 animate-ping-soft rounded-full bg-emerald-300/50" aria-hidden="true" />
                    <svg viewBox="0 0 24 24" className="relative h-12 w-12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="48" className="animate-draw-check" />
                    </svg>
                  </span>
                  <h3 className="mt-6 animate-fade-in-up text-2xl font-extrabold text-navy [animation-delay:200ms]">Thank you, {sentTo}!</h3>
                  <p className="mt-2 max-w-sm animate-fade-in-up text-slate-600 [animation-delay:300ms]">
                    Your message is on its way to our team. We&apos;ll reply to the email you gave us, usually within one working day.
                  </p>
                  <Button variant="secondary" className="mt-8 animate-fade-in-up [animation-delay:400ms]" onClick={() => setSentTo(null)}>
                    Send another message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5" aria-label="Contact us">
                  {serverError && <Alert variant="error">{serverError}</Alert>}

                  <fieldset>
                    <legend className="text-sm font-semibold text-navy">What can we help with?</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {TOPICS.map((t) => {
                        const active = topic === t.value;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setValue('topic', t.value, { shouldDirty: true })}
                            className={[
                              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ring-inset transition-all duration-200',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue',
                              active
                                ? 'bg-brand-gradient text-white shadow-glow ring-transparent'
                                : 'bg-white text-slate-600 ring-slate-200 hover:-translate-y-0.5 hover:text-brand-blue hover:ring-brand-blue/40',
                            ].join(' ')}
                          >
                            <t.icon size={15} /> {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <TextField label="Your name" leftIcon={<User size={17} />} autoComplete="name" placeholder="Riya Sharma" error={errors.name?.message} {...register('name')} />
                    <TextField label="Email" type="email" leftIcon={<Mail size={17} />} autoComplete="email" placeholder="you@school.com" error={errors.email?.message} {...register('email')} />
                    <TextField label="Phone (optional)" type="tel" leftIcon={<Phone size={17} />} autoComplete="tel" placeholder="+91 98765 43210" error={errors.phone?.message} {...register('phone')} />
                    <TextField label="School (optional)" leftIcon={<Building2 size={17} />} autoComplete="organization" placeholder="Green Valley School" error={errors.organization?.message} {...register('organization')} />
                  </div>

                  <div>
                    <TextAreaField
                      label="Your message"
                      rows={5}
                      placeholder="Tell us about your school and what you'd like to know…"
                      error={errors.message?.message}
                      {...register('message')}
                    />
                    <p className={['mt-1 text-right text-xs tabular-nums', messageLength > MAX_MESSAGE ? 'font-semibold text-red-600' : 'text-slate-400'].join(' ')}>
                      {messageLength} / {MAX_MESSAGE}
                    </p>
                  </div>

                  {/* Honeypot — hidden from people and assistive tech; bots fill it. */}
                  <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                    <label htmlFor="contact-website">Website</label>
                    <input id="contact-website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
                  </div>

                  <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
                    {isSubmitting ? 'Sending…' : (
                      <>
                        Send message <Send size={17} />
                      </>
                    )}
                  </Button>
                  <p className="text-center text-xs text-slate-400">We&apos;ll only use your details to reply to this message.</p>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
