<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import IconSearch from "~icons/carbon/search";
import IconClose from "~icons/carbon/close";

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  search: [query: string];
  close: [];
}>();

const query = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.visible,
  (v) => {
    if (v) {
      nextTick(() => inputRef.value?.focus());
    } else {
      query.value = "";
      emit("search", "");
    }
  },
);

watch(query, (q) => emit("search", q));

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="absolute top-0 right-0 z-10 m-2 flex items-center gap-2 rounded-lg border border-edge bg-muted px-3 py-1.5 shadow-sm"
  >
    <IconSearch class="w-4 h-4 text-fg-muted" />
    <input
      ref="inputRef"
      v-model="query"
      class="bg-transparent text-sm outline-none w-48"
      placeholder="Search..."
      @keydown="handleKeydown"
    />
    <button class="text-fg-muted hover:text-fg-dim" @click="emit('close')">
      <IconClose class="w-4 h-4" />
    </button>
  </div>
</template>
