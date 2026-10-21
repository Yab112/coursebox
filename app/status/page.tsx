import type { Metadata } from "next";
import { StatusPage } from "@/components/status/status-page";

export const metadata: Metadata = {
  title: "Status · CourseBox",
  description: "Live health of the CourseBox API, database and storage, and what's being built next.",
};

export default function Page() {
  return <StatusPage />;
}
