import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { QuoteForm } from "@/components/quote-form";

export const Route = createFileRoute("/_authenticated/quotes/new")({
  head: () => ({ meta: [{ title: "Nová kalkulácia · Mima Production CRM" }] }),
  component: NewQuote,
});

function NewQuote() {
  return (
    <>
      <AppHeader title="Nová kalkulácia" />
      <div className="p-4 md:p-6 max-w-5xl">
        <QuoteForm />
      </div>
    </>
  );
}