import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { ReservationForm } from "@/components/reservation-form";

export const Route = createFileRoute("/_authenticated/reservations/new")({
  head: () => ({ meta: [{ title: "Nová rezervácia · MimaProduction CRM" }] }),
  component: NewReservation,
});

function NewReservation() {
  return (
    <>
      <AppHeader title="Nová rezervácia" />
      <div className="p-4 md:p-6">
        <ReservationForm />
      </div>
    </>
  );
}