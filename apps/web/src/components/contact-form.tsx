'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CONTACT_TOPICS, type ContactErrors } from '@/lib/contact';
import { Icon } from '@/components/icon';
import { SubmitButton } from '@/components/submit-button';

export function ContactForm({ source }: { source: 'website' | 'app' }) {
    const id = useId();
    const [pending, setPending] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [errors, setErrors] = useState<ContactErrors>({});
    const feedback = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (error || success) feedback.current?.focus();
    }, [error, success]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        setPending(true);
        setError('');
        setErrors({});
        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                signal: AbortSignal.timeout(20_000),
                body: JSON.stringify({ ...Object.fromEntries(data), source }),
            });
            const result = await response.json();
            if (response.ok && result.ok === true) {
                setSuccess(true);
            } else {
                setError(typeof result.error === 'string' ? result.error : 'Your message could not be sent. Please try again later.');
                setErrors(result.errors ?? {});
            }
        } catch {
            setError('We could not confirm delivery. Your message may have arrived; please wait before trying again.');
        } finally {
            setPending(false);
        }
    }

    if (success) return (
        <div className="contact-success" role="status" tabIndex={-1} ref={feedback}>
            <Icon name="check" size={24} />
            <h3>Message sent</h3>
            <p>Thank you. Your message is with the StoreCare team.</p>
            <button type="button" className="btn secondary" onClick={() => setSuccess(false)}>Send another message</button>
        </div>
    );

    return (
        <form className="contact-form" action="/api/contact" method="post" onSubmit={submit} aria-busy={pending}>
            {error && <div className="contact-feedback" role="alert" tabIndex={-1} ref={feedback}>{error}</div>}
            <div className="contact-honeypot" aria-hidden="true">
                <label htmlFor={`${id}-website`}>Website</label>
                <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            <fieldset className="contact-fields" disabled={pending}>
                <legend className="contact-honeypot">Your contact details and message</legend>
                <div className="contact-field-pair">
                    <div className="field">
                        <label htmlFor={`${id}-name`}>Name</label>
                        <input id={`${id}-name`} name="name" type="text" autoComplete="name" required maxLength={100} aria-invalid={!!errors.name} aria-describedby={errors.name ? `${id}-name-error` : undefined} />
                        {errors.name && <span className="contact-field-error" id={`${id}-name-error`}>{errors.name}</span>}
                    </div>
                    <div className="field">
                        <label htmlFor={`${id}-email`}>Email</label>
                        <input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={!!errors.email} aria-describedby={errors.email ? `${id}-email-error` : undefined} />
                        {errors.email && <span className="contact-field-error" id={`${id}-email-error`}>{errors.email}</span>}
                    </div>
                </div>
                <div className="field">
                    <label htmlFor={`${id}-topic`}>Topic</label>
                    <select id={`${id}-topic`} name="topic" required aria-invalid={!!errors.topic} aria-describedby={errors.topic ? `${id}-topic-error` : undefined}>
                        {CONTACT_TOPICS.map(topic => <option key={topic}>{topic}</option>)}
                    </select>
                    {errors.topic && <span className="contact-field-error" id={`${id}-topic-error`}>{errors.topic}</span>}
                </div>
                <div className="field">
                    <label htmlFor={`${id}-message`}>Message</label>
                    <textarea id={`${id}-message`} name="message" rows={6} required minLength={20} maxLength={5000} aria-invalid={!!errors.message} aria-describedby={`${id}-privacy${errors.message ? ` ${id}-message-error` : ''}`} />
                    {errors.message && <span className="contact-field-error" id={`${id}-message-error`}>{errors.message}</span>}
                </div>
                <div className="contact-form-footer">
                    <p id={`${id}-privacy`}>Please don&apos;t include passwords, API keys, or payment details.</p>
                    <SubmitButton pending={pending} pendingText="Sending…">Send message<Icon name="arrow" size={16} /></SubmitButton>
                </div>
            </fieldset>
        </form>
    );
}