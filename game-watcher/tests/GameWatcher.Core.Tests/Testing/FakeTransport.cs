using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using GameWatcher.Core.Http;

namespace GameWatcher.Core.Tests.Testing
{
    // In-memory IHttpTransport for the brain tests. Records every request and answers via a
    // handler func, so a test can route by path or script a status sequence.
    public sealed class FakeTransport : IHttpTransport
    {
        private readonly Func<HttpRequestSpec, HttpResponse> _handler;

        public List<HttpRequestSpec> Requests { get; } = new();

        public FakeTransport(Func<HttpRequestSpec, HttpResponse> handler) => _handler = handler;

        public static FakeTransport Always(int status, string body = "") =>
            new(_ => new HttpResponse(status, body));

        public Task<HttpResponse> SendAsync(HttpRequestSpec request, CancellationToken ct = default)
        {
            Requests.Add(request);
            return Task.FromResult(_handler(request));
        }
    }
}
