// src/app/about/welcome/page.tsx
import Image from "next/image";

export default function HeadteacherWelcomePage() {
  return (
    <article className="bg-white border rounded-2xl shadow-sm p-8 sm:p-10 leading-relaxed text-gray-800 max-w-4xl mx-auto">
      <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-800 text-center mb-8">
        Headteacher’s Welcome
      </h1>

      {/* Headteacher Photo */}
      <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
        <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full overflow-hidden border-4 border-blue-600 shadow-md shrink-0">
          <Image
            src="/headteacher.png"
            alt="Mr. Senu Peter, Head Teacher, Ayitikope M/A Basic School"
            width={300}
            height={300}
            className="w-full h-full object-cover"
            priority
          />
        </div>
        <div>
          <p className="text-lg sm:text-xl font-medium text-blue-900">
            <strong>Mr. Senu Peter</strong>
          </p>
          <p className="text-blue-700 font-semibold text-sm sm:text-base">
            Head Teacher, Ayitikope M/A Basic School
          </p>
        </div>
      </div>

      {/* Welcome Message */}
      <div className="space-y-6 text-lg sm:text-xl leading-8 text-gray-800">
        <p>
          <strong>
            Welcome to Ayitikope M/A Basic School — where Knowledge, Character, and Service come alive.
          </strong>
        </p>

        <p>
          It is with great joy that I welcome you to our school community. At Ayitikope M/A Basic School, we believe that education is not merely about passing exams, but about transforming lives and shaping destinies.
        </p>

        <p>
          Our goal is to develop learners who think independently, act with integrity, and serve with love. We are committed to creating an environment where every child feels seen, supported, and challenged to bring out their best — academically, socially, and morally.
        </p>

        <p>
          Through innovative teaching, the use of technology, and the nurturing of good character, we are building a new generation of leaders prepared for the changing world. Together with our dedicated teachers, supportive parents, and strong community, we are transforming education into a lifelong journey of discovery and purpose.
        </p>

        <p>
          We invite you to partner with us — as parents, guardians, and well-wishers — in shaping a brighter future for every child.
        </p>
      </div>

      {/* Signature */}
      <div className="mt-10 text-right text-blue-800">
        <p className="font-semibold text-lg sm:text-xl">Mr. Senu Peter</p>
        <p className="text-sm sm:text-base font-medium">Head Teacher</p>
        <p className="text-sm sm:text-base">Ayitikope M/A Basic School</p>
      </div>
    </article>
  );
}
