import { CreateForm } from "@/components/socialork/create-form";

export const dynamic = "force-dynamic";

export default function CreatePage() {
  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">New post</h1>
        <p className="so-sub">
          Write one brief and get a draft for each channel. Nothing publishes until a manager
          approves it. Generation uses the AI key configured for you or for this workspace — without
          one you can still write every variant by hand, as here.
        </p>
      </div>
      <CreateForm />
    </div>
  );
}
