export class Animation {
  constructor(options) {
    options = Object.assign(
      {
        current: 0,
        target: 0,
        progress: 0,
        time: 1,
      },
      options
    );

    this.current = options.current;
    this.target = options.target;
    this.progress = options.progress;
    this.time = options.time;
    this.start = this.current;
  }

  goTo(target, time) {
    if (time <= 1) {
      this.current = target;
    }

    this.target = target;
    this.time = time;
    this.progress = 0;
    this.start = this.current;
  }

  animate(elapsed) {
    if (this.progress >= 1 || isNaN(this.progress) || this.time <= 1) {
      this.current = this.target;
      return false;
    }

    const target = this.target;
    let progress = this.progress;
    const time = this.time;
    const start = this.start;
    progress += elapsed / time;
    progress = Math.min(progress, 1);
    this.current = start * (1.0 - progress) + target * progress;
    this.progress = progress;

    return true;
  }

  cancelAnimation() {
    this.target = this.current;
    this.progress = 1;
  }
}
