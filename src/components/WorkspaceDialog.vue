<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import IconClose from "~icons/carbon/close";

const props = defineProps<{ open: boolean; label: string; title?: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
let previousFocus: HTMLElement | null = null;
let mounted = false;

async function syncOpen() {
  if (!mounted) return;
  await nextTick();
  const element = dialog.value;
  if (!element) return;
  if (props.open && !element.open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (element.showModal) element.showModal();
    else element.setAttribute("open", "");
  } else if (!props.open && element.open) {
    if (element.close) element.close();
    else element.removeAttribute("open");
    if (previousFocus?.isConnected) previousFocus.focus();
  }
}

function handleBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    emit("close");
}

onMounted(() => {
  mounted = true;
  void syncOpen();
});
watch(() => props.open, syncOpen);
onBeforeUnmount(() => {
  mounted = false;
  if (dialog.value?.open) dialog.value.close?.();
  if (previousFocus?.isConnected) previousFocus.focus();
});
</script>

<template>
  <dialog
    ref="dialog"
    class="workspace-dialog"
    :aria-label="label"
    @cancel.prevent="emit('close')"
    @click="handleBackdrop"
  >
    <header v-if="title" class="workspace-dialog-heading">
      <h2>{{ title }}</h2>
      <button
        type="button"
        class="workspace-icon"
        :aria-label="`Close ${label}`"
        @click="emit('close')"
      >
        <IconClose />
      </button>
    </header>
    <slot />
  </dialog>
</template>
