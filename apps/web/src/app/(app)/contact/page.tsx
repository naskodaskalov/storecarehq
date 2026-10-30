import type { Metadata } from 'next';
import { ContactForm } from '@/components/contact-form';

export const metadata: Metadata = { title: 'Contact | StoreCare HQ' };

export default function ContactPage() {
    return (
        <div className="workspace-page contact-page">
            <header className="page-heading"><div>
                <h1>Contact</h1>
                <p>Questions, feedback, or a hand with your workspace.</p>
            </div></header>
            <section className="workspace-section" aria-labelledby="contact-title">
                <div className="workspace-section-heading"><h2 id="contact-title">Send us a message</h2></div>
                <ContactForm source="app" />
            </section>
        </div>
    );
}