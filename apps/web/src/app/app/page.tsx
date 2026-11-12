import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/chat-app";

export const metadata: Metadata = { title: "Pulse" };

export default function AppPage() {
  return <ChatApp />;
}
