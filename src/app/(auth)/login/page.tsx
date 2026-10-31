import { redirect } from "next/navigation";

/**
 * The sign-in screen now follows the SocialOrk design at /signin.
 * NextAuth itself is untouched: the form there calls the same credentials
 * provider, and every OAuth round trip still lands on /api/auth/callback.
 */
export default function LoginAlias() {
  redirect("/signin");
}
