export const metadata = { title: "Gallery • Ayitikope M/A Basic School" };

const images = [
  "/gallery/gateway-arch.png", // reuse if you also copied it here
  "/gallery/kg-learning.png",
  "/gallery/jhs-classroom.png",
  "/gallery/ict-lab.png",
  "/gallery/assembly.png",
  "/gallery/awards.png",
  "/gallery/admin-block.png",
];

export default function GalleryPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Gallery</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {images.map((src) => (
          <a key={src} href={src} target="_blank" className="group block overflow-hidden rounded-xl border">
            <img
              src={src}
              alt="Ayitikope M/A Basic School"
              className="w-full h-56 object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
          </a>
        ))}
      </div>
    </main>
  );
}
