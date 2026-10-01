<script lang="ts">
  import { ICONS, type IconName } from './icons';

  export let name: IconName;
  export let size = 16;
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each ICONS[name] as d}<path {d} />{/each}
</svg>

<style>
  .icon {
    display: block;
    flex: none;
  }
</style>
