import Image from "next/image";

const COLUMNS = 3;

/**
 * Three columns of product photos drifting slowly in opposite directions.
 * Each column renders its images twice so the -50% loop in globals.css is seamless.
 */
export function ProductMosaic({ images }: { images: string[] }) {
  const columns = Array.from({ length: COLUMNS }, (_, c) => images.filter((_, i) => i % COLUMNS === c));

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="grid h-full grid-cols-3 gap-1.5 px-1.5">
        {columns.map((column, c) => (
          <div
            key={c}
            className={`flex flex-col gap-1.5 ${c === 1 ? "animate-drift-down -mt-16" : "animate-drift-up"} ${c === 2 ? "-mt-28" : ""}`}
          >
            {[...column, ...column].map((src, i) => (
              <div key={i} className="relative aspect-[3/4] w-full shrink-0 bg-paper">
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="34vw"
                  loading={i < column.length ? "eager" : "lazy"}
                  className="object-cover mix-blend-multiply"
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-paper from-10% to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-paper from-5% to-transparent" />
    </div>
  );
}
