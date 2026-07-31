<template>
  <div>
    <!-- Hero: one composition — brand, headline, support, CTAs, full-bleed image -->
    <section
      class="relative flex min-h-screen items-end overflow-hidden pb-16 pt-28 md:items-center md:pb-0 md:pt-0"
    >
      <div class="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80"
          alt=""
          class="animate-hero-drift h-full w-full object-cover"
        >
        <div
          class="absolute inset-0 bg-gradient-to-t from-[var(--color-ink)] via-[var(--color-ink)]/55 to-[var(--color-ink)]/25"
        />
        <div
          class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(26,107,107,0.35),_transparent_55%)]"
        />
      </div>

      <div class="relative z-10 mx-auto w-full max-w-6xl px-6 lg:px-8">
        <p
          class="animate-fade-in font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Northline
        </p>
        <h1
          class="animate-fade-up mt-4 max-w-xl text-xl font-medium text-white/90 sm:text-2xl md:text-3xl"
          style="animation-delay: 120ms"
        >
          Ship calm, modular interfaces with Nuxt and Tailwind.
        </h1>
        <p
          class="animate-fade-up mt-4 max-w-md text-base text-white/70 sm:text-lg"
          style="animation-delay: 220ms"
        >
          A JavaScript-only starter so you can focus on product — not plumbing.
        </p>
        <div
          class="animate-fade-up mt-8 flex flex-wrap items-center gap-4"
          style="animation-delay: 320ms"
        >
          <NuxtLink
            id="get-started"
            to="#features"
            class="rounded-md bg-[var(--color-sea)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-sea-deep)]"
          >
            Explore features
          </NuxtLink>
          <NuxtLink
            to="#about"
            class="rounded-md border border-white/30 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
          >
            How it works
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section
      id="features"
      class="relative overflow-hidden bg-[var(--color-mist)] px-6 py-20 lg:px-8 lg:py-28"
    >
      <div
        class="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-[var(--color-sea)]/10 blur-3xl"
      />
      <div class="relative mx-auto max-w-6xl">
        <h2 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Built for clean starts
        </h2>
        <p class="mt-3 max-w-2xl text-[var(--color-ink)]/70">
          Layout, navigation, and styling conventions are already in place.
        </p>

        <ul class="mt-12 grid gap-10 sm:grid-cols-3">
          <li v-for="feature in features" :key="feature.title">
            <h3 class="font-display text-xl font-semibold">
              {{ feature.title }}
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-[var(--color-ink)]/70">
              {{ feature.description }}
            </p>
          </li>
        </ul>
      </div>
    </section>

    <!-- About -->
    <section
      id="about"
      class="border-t border-[var(--color-ink)]/10 bg-gradient-to-br from-[#dfe9eb] via-[var(--color-mist)] to-[#c8ddd8] px-6 py-20 lg:px-8 lg:py-28"
    >
      <div class="mx-auto max-w-6xl md:grid md:grid-cols-2 md:gap-16 md:items-center">
        <div>
          <h2 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Pure JavaScript, intentional structure
          </h2>
          <p class="mt-4 text-[var(--color-ink)]/75 leading-relaxed">
            Components, layouts, and pages stay in plain Vue SFCs with
            <code class="rounded bg-[var(--color-ink)]/5 px-1.5 py-0.5 text-sm">&lt;script setup&gt;</code>
            — no TypeScript required. Extend with composables and server routes as
            you grow.
          </p>
        </div>
        <div
          class="mt-10 aspect-[4/3] overflow-hidden rounded-sm md:mt-0"
        >
          <img
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80"
            alt="Bright workspace with desk and window light"
            class="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
          >
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
useHead({
  title: 'Northline — Nuxt JavaScript Starter',
})

const features = [
  {
    title: 'Modular layout',
    description:
      'Shared Navbar and Footer wrapped by a default layout so every page stays consistent.',
  },
  {
    title: 'Tailwind ready',
    description:
      '@nuxtjs/tailwindcss is wired in — utility classes and CSS variables for a clear visual system.',
  },
  {
    title: 'JS-only SFCs',
    description:
      'Composition API with script setup, no lang="ts", matching your project rules from day one.',
  },
]
</script>
