import { FishSymbol } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[radial-gradient(circle_at_top,_oklch(0.96_0.04_205),_oklch(0.88_0.07_210))] p-6 text-slate-950">
      <section className="box-border w-[calc(100vw-3rem)] max-w-xl rounded-3xl border border-white/70 bg-white/75 p-8 shadow-sm backdrop-blur sm:p-12">
        <div className="mb-8 flex size-12 items-center justify-center rounded-full bg-cyan-950 text-cyan-50">
          <FishSymbol aria-hidden="true" className="size-6" />
        </div>
        <p className="mb-3 text-sm font-medium tracking-[0.2em] text-cyan-900 uppercase">
          Aquarium idle game
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Glassgarden
        </h1>
        <p className="mt-5 max-w-md text-lg leading-8 text-slate-700">
          Nurture an aquarium that grows, adapts, and develops around the care
          you give it.
        </p>
        <Button
          className="mt-8"
          render={
            <a href="https://github.com/Michael-F-Bryan/glassgarden/tree/main/docs">
              Read the creative direction
            </a>
          }
        />
      </section>
    </main>
  );
}
