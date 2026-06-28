// ponytail: records with init-only setters need this type, which netstandard2.1 lacks.
// Standard one-line polyfill; the compiler only needs the type to exist. Drop when the
// lib targets net5.0+ (where it's built in).
namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit { }
}
