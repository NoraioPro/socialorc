import { ComposeForm } from "@/components/socialork/compose-form";

export const dynamic = "force-dynamic";

export default function CreatePage() {
  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">New post</h1>
        <p className="so-sub">
          Write one brief and get a draft for each channel. Nothing publishes until a manager
          approves it.
        </p>
      </div>
      <ComposeForm />
    </div>
  );
}
