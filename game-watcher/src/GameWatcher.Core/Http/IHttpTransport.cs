using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace GameWatcher.Core.Http
{
    // The single seam between the pure brain and the network. The production impl
    // (HttpClientTransport) injects the base URL + "Authorization: Bearer <host key>"
    // so no brain component handles auth. Tests supply a fake.
    public interface IHttpTransport
    {
        Task<HttpResponse> SendAsync(HttpRequestSpec request, CancellationToken ct = default);
    }

    public sealed record HttpRequestSpec(HttpMethod Method, string Path, string? JsonBody = null);

    // StatusCode 0 is reserved for "no HTTP response" (network failure) so callers can
    // treat it as transient without catching exceptions across the seam.
    public sealed record HttpResponse(int StatusCode, string Body);
}
