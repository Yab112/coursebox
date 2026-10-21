import { UploadButton } from "./importer";
import { Marker } from "./primitives";
import { LibraryLink } from "./site-nav";
import { XrayFigure } from "./xray";

export function Hero() {
  return (
    <section className="px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
      <div className="mx-auto max-w-6xl">
        <p className="font-code text-xs tracking-wide text-ink-3 uppercase">A reader for the courses you downloaded</p>

        <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-6">
          <h1 className="font-display text-[3.25rem] leading-[0.95] tracking-[-0.01em] text-balance sm:text-[5.5rem] lg:col-span-8 lg:text-[6.5rem]">
            You downloaded the course. <em className="text-ink-2">Now take it.</em>
          </h1>
          <div className="lg:col-span-4 lg:pb-3">
            <p className="text-[17px] leading-relaxed text-ink-2">
              Drop in a zip from <Marker>MIT OpenCourseWare</Marker>, a Udemy-style download or any folder of lectures and PDFs. CourseBox
              sorts it into sections and lessons, opens every file in one player and remembers where you stopped.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
              <UploadButton />
              <LibraryLink />
            </div>
            <p className="mt-5 font-code text-[11px] leading-5 text-ink-3">Free &amp; open source · no account · runs in your browser</p>
          </div>
        </div>

        <div className="mt-14 sm:mt-20">
          <XrayFigure />
        </div>
      </div>
    </section>
  );
}
