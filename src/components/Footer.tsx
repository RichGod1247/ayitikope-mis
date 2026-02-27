// src/components/Footer.tsx
"use client";

import { useEffect, useRef, useState } from "react";

export default function Footer() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setShow(true)),
      { threshold: 0.2 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const phoneDisplay = "0245 444 861";
  const phoneTel = "tel:0245444861";
  const email = "ayitikopemabasic@gmail.com";

  return (
    <footer
      ref={ref}
      className={`bg-[#e9f2ff] border-t transition-all duration-700 ease-out ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
      }`}
    >
      <div className="container mx-auto px-6 py-10">
        <div className="grid sm:grid-cols-3 gap-8">
          <div>
            <div className="font-semibold">Ayitikope M/A Basic School</div>
            <p className="text-sm text-gray-600 mt-2">“Knowledge • Character • Service.”</p>
          </div>

          <div>
            <div className="font-semibold">Quick Links</div>
            <ul className="text-sm mt-2 space-y-1">
              <li>
                <a href="/admissions" className="hover:underline">
                  Admissions
                </a>
              </li>
              <li>
                <a href="/parent-portal" className="hover:underline">
                  Parents’ Portal
                </a>
              </li>
              <li>
                <a href="/teacher-portal" className="hover:underline">
                  Teachers’ Portal
                </a>
              </li>
              <li>
                <a href="/gallery" className="hover:underline">
                  Gallery
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Contact</div>
            <ul className="text-sm mt-2 space-y-1">
              <li>
                <span>Ayitikope, Ghana</span>
              </li>
              <li>
                <a className="hover:underline" href={phoneTel}>
                  {phoneDisplay}
                </a>
              </li>
              <li>
                <a className="hover:underline" href={`mailto:${email}`}>
                  {email}
                </a>
              </li>
              <li>
                <a href="/contact" className="hover:underline">
                  Send a message
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-gray-600">
          © {new Date().getFullYear()} Ayitikope M/A Basic School. All rights reserved.
        </div>
      </div>
    </footer>
  );
}