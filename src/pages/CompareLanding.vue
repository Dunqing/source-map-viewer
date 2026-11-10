<script setup lang="ts">
import { ref } from "vue";
import IconArrowLeft from "~icons/carbon/arrow-left";
import { buildComparePath, extractShareSlug } from "../composables/navigation";

interface CompareEntry {
  generatedCode: string;
  sourceMapJson: string;
  label: string;
}

const props = defineProps<{
  prefilledA?: CompareEntry | null;
  slugA?: string;
}>();

const urlA = ref("");
const urlB = ref("");
const error = ref<string | null>(null);

async function handleCompare() {
  error.value = null;
  const slugA = props.prefilledA ? "" : extractShareSlug(urlA.value);
  const slugB = extractShareSlug(urlB.value);

  if (!props.prefilledA && !slugA) {
    error.value = "Please enter URL A";
    return;
  }
  if (!slugB) {
    error.value = "Please enter URL B";
    return;
  }

  if (props.prefilledA) {
    // Preserve the existing ?a slug from the URL
    const currentSlugA = props.slugA ?? "";
    window.location.href = buildComparePath(currentSlugA, slugB);
    return;
  }

  window.location.href = buildComparePath(slugA, slugB);
}
</script>

<template>
  <div class="compare-landing">
    <div class="compare-content">
      <a href="/" class="compare-back">
        <IconArrowLeft class="w-4 h-4" />
        Back to home
      </a>

      <div class="compare-heading">
        <h1>Compare Source Maps</h1>
        <p>
          {{
            prefilledA
              ? "Enter a second URL to compare against"
              : "Paste two viewer URLs to diff their mappings"
          }}
        </p>
      </div>

      <div v-if="error" class="compare-error">
        {{ error }}
      </div>

      <div class="compare-inputs">
        <!-- URL A -->
        <div class="compare-input-row">
          <label class="compare-label">URL A</label>
          <div v-if="prefilledA" class="compare-prefilled">
            {{ prefilledA.label }}
          </div>
          <input
            v-else
            v-model="urlA"
            class="compare-field"
            placeholder="https://source-map-viewer.void.app/abc123 or just abc123"
            @keydown.enter="handleCompare"
          />
        </div>

        <!-- URL B -->
        <div class="compare-input-row">
          <label class="compare-label">URL B</label>
          <input
            v-model="urlB"
            class="compare-field"
            placeholder="https://source-map-viewer.void.app/xyz789 or just xyz789"
            @keydown.enter="handleCompare"
          />
          <p class="compare-help">
            Open another source map in the viewer, click Share, then paste the URL here
          </p>
        </div>
      </div>

      <button
        class="compare-submit"
        :disabled="(!prefilledA && !urlA.trim()) || !urlB.trim()"
        @click="handleCompare"
      >
        Compare
      </button>

      <p v-if="!prefilledA" class="compare-tip">
        Tip: you can also click Compare in the visualization toolbar to pre-fill URL A
      </p>
    </div>
  </div>
</template>

<style scoped>
.compare-landing {
  --compare-accent: #246fc6;
  min-height: 100dvh;
  padding: 64px 24px 32px;
  background: var(--c-bg);
  color: var(--c-text);
}

.compare-content {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.compare-back {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--c-text-3);
  font-size: 13px;
  transition: color 120ms;
}

.compare-back:hover {
  color: var(--c-text);
}

.compare-heading {
  margin: 34px 0 28px;
}

.compare-heading h1 {
  font-size: 26px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.7px;
}

.compare-heading p {
  margin-top: 10px;
  color: var(--c-text-3);
  font-size: 14px;
  line-height: 1.6;
}

.compare-inputs {
  border-top: 1px solid var(--c-border);
}

.compare-input-row {
  padding: 22px 0;
  border-bottom: 1px solid var(--c-border);
}

.compare-label {
  display: block;
  margin-bottom: 10px;
  color: var(--c-text-2);
  font-size: 13px;
  font-weight: 550;
}

.compare-field,
.compare-prefilled {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--c-border);
  border-radius: 4px;
  background: var(--c-bg);
  color: var(--c-text);
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
}

.compare-field::placeholder {
  color: var(--c-text-3);
}

.compare-prefilled {
  background: var(--c-bg-soft);
  overflow-wrap: anywhere;
}

.compare-help,
.compare-tip {
  color: var(--c-text-3);
  font-size: 12px;
  line-height: 1.7;
}

.compare-help {
  margin-top: 10px;
}

.compare-tip {
  margin-top: 24px;
}

.compare-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  margin-top: 22px;
  padding: 8px 20px;
  border-radius: 4px;
  background: var(--compare-accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  transition: background-color 120ms;
}

.compare-submit:hover {
  background: #1e62b0;
}

.compare-submit:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.compare-error {
  margin-bottom: 20px;
  padding: 12px 14px;
  border-left: 2px solid var(--c-text-3);
  background: var(--c-bg-soft);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.compare-landing :is(button, a, input):focus-visible {
  outline: 2px solid var(--compare-accent);
  outline-offset: 3px;
}

@media (max-width: 600px) {
  .compare-landing {
    padding: 32px 18px;
  }

  .compare-heading h1 {
    font-size: 23px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .compare-landing * {
    transition: none !important;
  }
}
</style>
