<!-- @format -->

`fetch-dns`
============

This is a drop-in replacement for [Node's `dns` API](https://nodejs.org/api/dns.html). It uses [the `fetch` API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) under
the hood, so anywhere you have `fetch`, you can have the `dns` module.

It is left as an exercise for the reader to get this module to be returned when the code says `require("dns")`.

Unimplemented Methods
========================

There are two functions which are not implemented because I don't (yet) know a way to implement them using just the `fetch` API:

  * `reverse`
  * `lookupService`

