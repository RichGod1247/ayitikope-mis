export const metadata = { title: "Gallery • Ayitikope M/A Basic School" };

type Item = { src: string; label: string; alt?: string };

const items: Item[] = [
  { src: "/gallery/gateway-arch.png", label: "Gateway Arch (Entrance)" },
  { src: "/gallery/kg-learning.png",  label: "Kindergarten Learning" },
  { src: "/gallery/jhs-classroom.png",label: "JHS Smart Classroom" },
  { src: "/gallery/ict-lab.png",      label: "ICT Laboratory" },
  { src: "/gallery/awards.png",       label: "Awards & Recognition" },
  { src: "/gallery/admin-block.png",  label: "Administration Block" }, // ensure this file exists
];


export default function GalleryPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Gallery</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map(({ src, label, alt }) => (
          <a
            key={src}
            href={src}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
            className="group relative block overflow-hidden rounded-xl border bg-white"
          >
            {/* Image */}
            <img
              src={src}
              alt={alt ?? label}
              loading="lazy"
              className="w-full h-56 object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />

            {/* Caption overlay */}
            <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors duration-300" />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-3 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
              <div className="m-3 rounded-lg bg-black/70 px-3 py-1.5 text-center text-sm font-medium text-white shadow">
                {label}
              </div>
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
