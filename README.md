# Cloudflare Worker

This is a app written on [Cloudflare Workers](https://workers.cloudflare.com/) utilizing [Durable Objects](https://blog.cloudflare.com/introducing-workers-durable-objects) to implement real-time chat with stored history
## How does it work?

This chat app uses a Durable Object to control each chat room. Users connect to the object using WebSockets. Messages from one user are broadcast to all the other users. 

## Learn More

* [Durable Objects introductory blog post](https://blog.cloudflare.com/introducing-workers-durable-objects)
* [Durable Objects documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects)
## How to run this app
Open file named wrangler.toml
Change your account_id below.(account_id get it in https://dash.cloudflare.com/4bf90431d5a161c80b07ac520cd4337b/workers/overview)
```
name = "winter-bar-aae0"
workers_dev = true
compatibility_date = "2023-03-06"
account_id="your_account_id"
main = "src/worker.mjs"

[durable_objects]
bindings = [
  { name = "rooms", class_name = "Room" },
]

[[rules]]
type = "Data"
globs = ["**/*.html"]
fallthrough = false

# Indicate that you want the Room classes to be callable as Durable Objects.
[[migrations]]
tag = "v1" # Should be unique for each entry
new_classes = ["Room"]
```
## Commands
```
<!-- Installed wrangler to global-->
npm install -g wrangler
or yarn global add wrangler

<!-- To run app on your local -->
npx wrangler dev
```