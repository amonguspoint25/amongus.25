using System;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace GameWatcher.Core.Http
{
    // ponytail: thin adapter over HttpClient — no unit test (it just wires HttpClient to the
    // seam; behavior lives in the components + the fake transport). Verified for real in the
    // Plan #3 on-PC end-to-end pass. Network failures become StatusCode 0 so the brain's
    // Sender can treat them as transient without try/catch leaking across the seam.
    public sealed class HttpClientTransport : IHttpTransport
    {
        private readonly HttpClient _http;
        private readonly string _baseUrl;
        private readonly string _hostKey;

        public HttpClientTransport(HttpClient http, string baseUrl, string hostKey)
        {
            _http = http ?? throw new ArgumentNullException(nameof(http));
            _baseUrl = (baseUrl ?? throw new ArgumentNullException(nameof(baseUrl))).TrimEnd('/');
            _hostKey = hostKey ?? throw new ArgumentNullException(nameof(hostKey));
        }

        public async Task<HttpResponse> SendAsync(HttpRequestSpec request, CancellationToken ct = default)
        {
            using var msg = new HttpRequestMessage(request.Method, _baseUrl + request.Path);
            msg.Headers.TryAddWithoutValidation("Authorization", "Bearer " + _hostKey);
            if (request.JsonBody != null)
                msg.Content = new StringContent(request.JsonBody, Encoding.UTF8, "application/json");

            try
            {
                using var resp = await _http.SendAsync(msg, ct).ConfigureAwait(false);
                var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                return new HttpResponse((int)resp.StatusCode, body);
            }
            catch (HttpRequestException)
            {
                return new HttpResponse(0, string.Empty);
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                // Timeout (not caller cancellation) — treat as transient/no-response.
                return new HttpResponse(0, string.Empty);
            }
        }
    }
}
