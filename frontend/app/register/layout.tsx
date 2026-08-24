import type { Metadata } from "next";

export const metadata: Metadata = { title: "Register a project · NeelKosh" };

export default function RegisterLayout({ children }: LayoutProps<"/register">) {
  return children;
}
