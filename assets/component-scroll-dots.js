/**
 * <scroll-dots for="track-id">: a row of dots under a sideways-scrolling track,
 * so a phone visitor can see there are more cards and where they are in the row.
 * Decorative only: the track itself stays the swipe and keyboard target.
 * Hides itself whenever the track does not overflow (desktop grids).
 */
if (!customElements.get('scroll-dots')) {
  customElements.define(
    'scroll-dots',
    class ScrollDots extends HTMLElement {
      connectedCallback() {
        this.track = document.getElementById(this.getAttribute('for'));
        if (!this.track) return;
        this.setAttribute('aria-hidden', 'true');
        this.update = this.update.bind(this);
        this.build = this.build.bind(this);
        this.track.addEventListener('scroll', this.update, { passive: true });
        this.resizeObserver = new ResizeObserver(this.build);
        this.resizeObserver.observe(this.track);
        // Cards can arrive after load (the reviews wall fills in from a feed).
        this.mutationObserver = new MutationObserver(this.build);
        this.mutationObserver.observe(this.track, { childList: true });
        this.build();
      }

      disconnectedCallback() {
        if (!this.track) return;
        this.track.removeEventListener('scroll', this.update);
        this.resizeObserver.disconnect();
        this.mutationObserver.disconnect();
      }

      build() {
        const count = Array.from(this.track.children).filter((el) => el.offsetParent !== null).length;
        const overflows = this.track.scrollWidth - this.track.clientWidth > 4;
        this.hidden = !overflows || count < 2;
        if (this.hidden) return;
        if (this.children.length !== count) {
          this.replaceChildren(
            ...Array.from({ length: count }, () => {
              const dot = document.createElement('span');
              dot.className = 'scroll-dots__dot';
              return dot;
            })
          );
        }
        this.update();
      }

      update() {
        if (this.hidden || !this.children.length) return;
        const max = this.track.scrollWidth - this.track.clientWidth;
        const progress = max > 0 ? Math.abs(this.track.scrollLeft) / max : 0;
        const active = Math.round(progress * (this.children.length - 1));
        Array.from(this.children).forEach((dot, index) => {
          dot.classList.toggle('is-active', index === active);
        });
      }
    }
  );
}
