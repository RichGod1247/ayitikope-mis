import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 bg-white border-t">
      <div className="container mx-auto px-4 sm:px-6 py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h4 className="font-semibold text-ugBlue mb-3">About</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li><Link href="/about">Overview</Link></li>
            <li><Link href="/about">Mission & Values</Link></li>
            <li><Link href="/contact">Leadership</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-ugBlue mb-3">Admissions</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li><Link href="/contact">How to Apply</Link></li>
            <li><Link href="/gallery">Visit Campus</Link></li>
            <li><Link href="/contact">Financial Aid</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-ugBlue mb-3">Academics</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li><Link href="/about">Curriculum</Link></li>
            <li><Link href="/about">Departments</Link></li>
            <li><Link href="/gallery">Clubs & Societies</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-ugBlue mb-3">Connect</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li><Link href="/contact">Contact</Link></li>
            <li><a href="mailto:hehrichgod@gmail.com">Email us</a></li>
            <li><Link href="/">News & Events</Link></li>
          </ul>
        </div>
      </div>
      <div className="bg-ugBlue text-white text-sm">
        <div className="container mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Ayitikope M/A Basic School</span>
          <span className="opacity-80">Powered by Next.js • Deployed on Vercel</span>
        </div>
      </div>
    </footer>
  );
}
