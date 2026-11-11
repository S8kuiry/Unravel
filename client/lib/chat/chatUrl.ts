export function setChatParam(value: string | null, replace = false) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set("chat", value);
    else params.delete("chat");
    const url = `${window.location.pathname}?${params.toString()}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
}