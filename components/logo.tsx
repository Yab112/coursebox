import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M7 9.5V15c0 1.5 2.2 3 5 3s5-1.5 5-3V9.5" />
        </svg>
      </span>
      <span className="text-[17px]">CourseBox</span>
    </Link>
  );
}
