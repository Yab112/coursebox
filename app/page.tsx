import type { Metadata } from "next";
import { Hero } from "@/components/landing/hero";
import { Faq, Features, FinalCta, Footer, HowItWorks, LocalFirst, Roadmap, Sources } from "@/components/landing/sections";
import { Showcase } from "@/components/landing/showcase";
import { SiteNav } from "@/components/landing/site-nav";

export const metadata: Metadata = {
  title: "CourseBox · Turn course downloads into your own learning space",
  description:
    "Drop in an MIT OpenCourseWare export, a Udemy-style folder or any zip of videos and PDFs. CourseBox turns it into a clean course player with progress tracking, right in your browser.",
  openGraph: {
    title: "CourseBox",
    description: "Turn any course download into your own learning space.",
    images: [{ url: "/screenshots/course-home.png", width: 1440, height: 900 }],
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <SiteNav />
      <main>
        <Hero />
        <Sources />
        <HowItWorks />
        <Showcase />
        <Features />
        <LocalFirst />
        <Roadmap />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
