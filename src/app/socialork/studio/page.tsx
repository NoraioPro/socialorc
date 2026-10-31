import { StudioForm } from "@/components/socialork/studio-form";

export const dynamic = "force-dynamic";

export default function StudioPage() {
  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">AI Studio</h1>
        <p className="so-sub">
          One idea in, several variants out, each respecting its channel's length and tone. Nothing
          is saved until you pick a variant — and nothing publishes without an approval.
        </p>
      </div>
      <StudioForm />
    </div>
  );
}
