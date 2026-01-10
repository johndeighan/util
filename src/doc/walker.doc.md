Using lib walker
================

SYNOPSIS:

```coffee
type TPerson = {
	fName: string
	lName: string
	}

hAst := {
	fName: 'John'
	lName: 'Deighan'
	lFriends: [
		{fName: 'John', lName: 'Bowling'}
		{fname: 'Julie', lName: 'Booker'}
		]
	}

walker = new Walker<TPerson>()
walker.isNode = (x) =>
	   x.keys().includes('fName')
	&& x.keys().includes('lName')

lNames := for hInfo of walker.walk(hAst)
	"#{hInfo.node.fName} #{hInfo.node.lName}"

console.log lNames
```

Expected output:

```text
John Deighan
John Bowling
Julie Booker
```

Alternatively, you can create a subclass of Walker<T>
and define the isNode() method there.

