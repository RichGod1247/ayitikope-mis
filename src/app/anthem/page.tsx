export const metadata = { title: "School Anthem • Ayitikope M/A Basic School" };

export default function AnthemPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold">School Anthem</h1>
      <p className="mt-2 text-gray-600">Ayitikope M/A Basic School</p>

      <div className="mt-6 rounded-xl border bg-white p-6 shadow-sm leading-7">
        <p>We stand as one, united we stand</p>
        <p>Ayitikope Basic School, our noble land</p>
        <p>Upon this ground, our strong foundation laid</p>
        <p>The classroom walls hold all the wisdom we pursue</p>
        <p>With our teachers gentle guidance, honest, strong and truth</p>
        <p>Discipline and respect are the values we hold so dear</p>
        <p>You've got the power, you've got the might</p>
        <p>Believe in yourself, shine with all your light 2x.</p>

        <br />
        <p className="font-semibold">Chorus</p>
        <p>We sing your praise, our future's light</p>
        <p>Ayiti Basic School, we'll make you proud</p>
        <p>Our excellence will shine forever loud</p>
        <p>The school is ours, a spirit so devine 2x.</p>
      </div>

      <p className="mt-4 text-sm text-gray-600">
        Composed by <span className="font-medium">Miss Fumador Getrude Dela</span>.
        <br />
        (Audio tune to be uploaded.)
      </p>
    </main>
  );
}
