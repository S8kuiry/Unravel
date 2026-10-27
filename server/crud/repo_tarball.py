import hashlib
import io
import tarfile
import time
from urllib.parse import quote


async def fetch_tarball_contents(
    client,
    headers: dict,
    api_url: str,
    owner: str,
    repo: str,
    branch: str,
    wanted: dict[str, str],   # path -> expected git blob sha
    budget_seconds: float = 40,
) -> tuple[dict[str, str], set[str]]:
    """Return {path: text} for wanted files. Stops early if the time budget runs out."""
    resp = await client.get(
        f"{api_url}/repos/{owner}/{repo}/tarball/{quote(branch, safe='/')}",
        headers=headers,
        follow_redirects=True,
    )
    if resp.status_code != 200:
        return {}, set()

    deadline = time.monotonic() + budget_seconds
    out: dict[str, str] = {}
    binary: set[str] = set()

    

    with tarfile.open(fileobj=io.BytesIO(resp.content), mode="r:gz") as tar:
        for member in tar:
            if time.monotonic() > deadline:
                break
            if not member.isfile() or "/" not in member.name:
                continue

            path = member.name.split("/", 1)[1]  # strip "owner-repo-sha/"
            expected = wanted.get(path)
            if expected is None:
                continue

            data = tar.extractfile(member).read()
            if hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest() != expected:
                continue  # branch moved since the tree call; leave it lazy

            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                binary.add(path)
                continue
            if "\x00" in text:
                binary.add(path)
                continue

            out[path] = text

    return out, binary