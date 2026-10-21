import type { Metadata } from "next";
import { Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Hero } from "@/components/landing/hero";
import { LandingImporter } from "@/components/landing/importer";
import { Closing, Colophon, LocalFirst, NextTerm, OfficeHours, Steps, Syllabus } from "@/components/landing/sections";
import { Showcase } from "@/components/landing/showcase";
import { SiteNav } from "@/components/landing/site-nav";

const serif = Instrument_Serif({ variable: "--font-instrument", weight: "400", style: ["normal", "italic"], subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CourseBox · You downloaded the course. Now take it.",
  description:
    "Drop in an MIT OpenCourseWare download, a Udemy-style folder or any zip of lectures and PDFs. CourseBox sorts it into a real course with progress tracking, right in your browser.",
  openGraph: {
    title: "CourseBox",
    description: "You downloaded the course. Now take it.",
    images: [{ url: "/screenshots/course-home.png", width: 1440, height: 900 }],
  },
};

export default function LandingPage() {
  return (
    <div className={`landing ${serif.variable} ${mono.variable} min-h-dvh bg-paper text-ink`}>
      <LandingImporter>
        <SiteNav />
        <main>
          <Hero />
          <Steps />
          <Syllabus />
          <Showcase />
          <LocalFirst />
          <NextTerm />
          <OfficeHours />
          <Closing />
        </main>
        <Colophon />
      </LandingImporter>
    </div>
  );
}
