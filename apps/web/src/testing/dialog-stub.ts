// jsdom does not implement HTMLDialogElement.showModal()/close(). Test-only stand-ins that
// toggle the `open` attribute, which is all the specs rely on.
export function stubDialog(): void {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}
